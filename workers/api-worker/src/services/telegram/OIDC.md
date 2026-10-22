# Telegram notification login

Telegram login uses Authorization Code + S256 PKCE directly, without the Telegram
JavaScript SDK. Reference: https://core.telegram.org/bots/telegram-login

## Flow

1. Manager opens an unsized blank tab directly from the click, then calls
   authenticated `POST /notifications/channels/telegram/oauth`.
2. The Worker stores one current attempt per ENS user in PostgreSQL and returns
   the authorization URL. The attempt lasts ten minutes. Its random state is
   stored as a SHA-256 digest, separately from the status ID. The PKCE verifier
   stays server-side; the nonce is stored and sent in the authorization request.
   Initiation has a ten-second per-user cooldown.
3. Telegram redirects to public `GET /notifications/channels/telegram/callback`.
   An atomic update claims the unexpired state exactly once before any token
   exchange. No cookies, wallet token or original browser session are needed.
4. The Worker exchanges the code using HTTP Basic client authentication and the
   stored PKCE verifier/redirect URI. `jose` verifies the ID token against the
   fixed Telegram JWKS endpoint, requiring RS256, issuer, audience, subject,
   issued-at, expiry, nonce and the profile `id`. The ID accepts a positive safe
   integer or a decimal digit string, normalized to the existing numeric Bot API
   ID. The OIDC `sub` is not
   the Telegram Bot API chat ID. Telegram has no UserInfo endpoint.
5. Requested scopes are `openid profile telegram:bot_access`; no phone scope.
   Bot access has no documented ID-token claim. A successful bot message is
   required before linking. Any delivery failure rejects the new connection.
   A 403 or another permanent delivery refusal also disables an already
   associated channel for this wallet/target; transient failures preserve its status.
6. One SQL statement marks the attempt completed and upserts the exact
   `(user_id, channel, target)` channel. It rechecks status and expiry, so
   cancellation or replacement during token exchange cannot link an account.
   Reconnecting the same Telegram identity preserves channel ID and preferences.
   A different identity creates a separate channel, preserving existing
   associations; Manager displays a verified Telegram channel preferentially.
7. A static callback page tells the user to return to the original Manager tab.
   Manager checks authenticated `GET /notifications/channels/telegram/oauth`,
   refreshes on focus/visibility, and polls every five seconds while pending.
   Polling pauses in the background and stops at completion/expiry or unmount.
   An independent local deadline also releases the UI when the network fails.
8. Authenticated `DELETE /notifications/channels/telegram/oauth/:id` cancels
   only the initiating user's current attempt. Closing the Telegram tab is not
   treated as cancellation: the flow may have moved to another browser/app.
   Removing a Telegram channel also cancels the user's pending login in the
   same transaction, preventing a late callback from recreating the channel.

Manager offers an explicit new-tab link if automatic opening/navigation fails.
The backend recovers pending status across remounts/reloads; the authorization
URL is held only in memory. After a reload, a user whose Telegram tab was lost
can cancel and start again. Starting again invalidates older authorization URLs.
Do not share authorization URLs: they authorize linking to the initiating wallet.

No Telegram access/ID tokens are stored or returned to Manager. Credentials are
cleared when an attempt completes, fails, or is cancelled. Expired attempts are
removed by the existing authentication cleanup cron (every three hours).
Existing verified channels require no migration or reconnection. Queues,
delivery, preferences, and the `/start` recovery webhook keep their existing role.
Telegram accounts without usernames use their profile name or `Telegram account`.

## Manual setup and rollout

Configure **each environment's own bot** in BotFather → Login Widget:

- Obtain its Client ID and Client Secret. The Client ID must match the bot ID in
  that environment's existing `TELEGRAM_BOT_TOKEN`.
- Keep ID-token signing set to **RS256**. Other algorithms fail closed.
- Register the exact redirect URI formed by appending
  `notifications/channels/telegram/callback` to `BASE_URL`.
  The URL must reach the Worker's callback handler; an app-domain `/api` proxy
  is fine, but a Manager page must not process the authorization code.
- Provision `TELEGRAM_OIDC_CLIENT_ID` and `TELEGRAM_OIDC_CLIENT_SECRET` through the
  existing Wrangler secret workflow, separately for default/Sepolia and
  `--env mainnet`. Keep `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` as before.
  No real secrets or BotFather settings are changed by this implementation.

Current checked-in callback URLs:

- Sepolia/staging: `https://sepolia.app-api.ens.domains/notifications/channels/telegram/callback`
- Mainnet/production: `https://mainnet.app-api.ens.domains/notifications/channels/telegram/callback`

`BASE_URL` is the externally reachable API base. A configured path prefix is
preserved: both `https://example.com/api` and `https://example.com/api/` produce
`https://example.com/api/notifications/channels/telegram/callback`. Configure the
proxy and register this exact external URL, including its path.

BotFather's trusted origins concern browser cross-origin requests. This flow
exchanges tokens in the Worker, without a browser request to Telegram's token
endpoint. Manager preview origins are therefore not token-request origins;
do not add per-preview callbacks or use the preview Host header to derive one.

PR previews currently share Sepolia resources and its canonical `BASE_URL`.
Set both OIDC secrets in **Previews Base**, with the same Sepolia bot as the
canonical callback Worker. The callback completes in the deployed Sepolia Worker
against the shared database; the preview checks status there via its own API.
Deploy the callback implementation before testing previews. If previews are
isolated in future, give them an independently registered callback and secrets.

For local development, put the OIDC values and the matching development bot
token in the Worker's untracked `.dev.vars`. Use a registered, publicly reachable
HTTPS callback (for example a tunnel to the local Worker), set local `BASE_URL`
to that origin, and point Manager's existing API setting to the local Worker.
Do not use production credentials or assume Telegram accepts unregistered
localhost URLs. Manager no longer needs `VITE_TELEGRAM_BOT_ID`.

Apply `drizzle/0008_telegram_oidc.sql` through the existing Drizzle migration
workflow **before deploying the Worker**, using the correct environment's
database. Deploy the Worker and then Manager. Older Manager tabs using the
removed HMAC endpoint must refresh to start a new connection. Existing channels
continue delivering. Do not retain the legacy endpoint as an authentication bypass.

`observability.redact_query_string` is enabled so callback codes/state do not
enter Cloudflare request logs/traces. Keep OAuth URLs, codes, token responses,
PKCE verifiers, client secrets, and bearer tokens out of access logs, analytics,
error reporting, reverse proxies and any external telemetry sinks as well.
Callback responses use `no-store`, `no-referrer` and a restrictive CSP with no
scripts. The only external resources are Manager’s fonts from `fonts.ens.dev`;
font requests carry no referrer. Styles use a per-response CSP nonce. The page
uses Manager’s theme tokens and offers a link to the configured `MANAGER_APP_URL`,
while directing users back to their original tab to preserve registration progress.
Avoid collecting full callback URLs in analytics.
**Rollout prerequisite: redact Telegram Bot API URL paths in telemetry.**
Automatic traces remain enabled by choice. Outbound Bot API URLs contain the
bot token in the path (`/bot<token>/...`); query-string redaction does not mask it.
Before deployment, ensure the tracing configuration and all telemetry sinks
redact or exclude these paths before capture/storage, including Cloudflare's
native trace storage and any external exports. Redacting only an exported copy
does not protect the native stored trace. Verify this with a development bot.
This implementation does not configure that telemetry redaction or change live
observability settings; do not treat the integration as ready for rollout until
this prerequisite is satisfied. Structured and invocation logs remain enabled.

## Validation

Persistence uses Drizzle query/CTE builders, matching email challenge redemption.
Completion and channel upsert remain atomic; SQL fragments are limited to typed
scalar expressions and database functions. JSON parameters use Drizzle's column
encoder. No handwritten SQL statements or additional database driver are used.

OIDC, persistence and orchestration return typed neverthrow Results composed
with `ResultFn`. Configuration, state, throttling, exchange, identity, messaging
and database failures remain distinct. A failure to record a failed attempt
retains both the original typed failure and the database error. Internal causes
are retained for handling; HTTP responses and logs expose only safe messages,
tags, stages and statuses. Manager uses the existing `resultQueryOptions` and
`resultMutationOptions` adapters and validates JSON responses before using them.

Failure logs include bounded nested cause/recovery diagnostics: library and
database error codes, failed claims, recognized OAuth error codes, and validation
field/expected-type/received-type summaries. Raw error messages, JWT payloads,
SQL parameters and validation inputs are excluded. Token requests use `follow`
redirect mode because Telegram's token endpoint requires redirects to complete
the exchange. The initial endpoint is fixed to Telegram's issuer; non-success
responses still produce typed exchange failures.

Testing follows `workers/api-worker/TESTING.md`: fast tests call the login
functions directly and mock owned persistence/provider operations. Logging and
page rendering are tested independently; route tests cover HTTP contracts.
Database tests call the real persistence operations for state consumption,
atomic linking, cancellation/replay races, reconnection, and failure cleanup,
with one composed route flow. Provider adapters use controlled HTTP responses;
automated tests never contact Telegram.

Worker: `pnpm typecheck`, `pnpm test`, and `pnpm test:db`.
The real-DB harness requires the dedicated local `api_worker_test` database and
rejects nonlocal URLs. Manager: `pnpm typecheck` and notification feature tests.

Manually test with a development/staging bot after configuring it:

- Connect from notification settings and during registration; continue
  interacting with Manager and the wallet throughout.
- Complete in another browser/app and return to Manager; verify its channels
  update without a reload. Check desktop, mobile and MetaMask's embedded browser.
- Confirm the live code flow echoes the requested nonce and returns the numeric
  profile `id`; missing/mismatched claims must continue to fail closed.
- Verify receipt of the bot message and an actual ENS notification. Check
  that declining bot access or blocking the bot cannot produce a new channel.
- Test denial, closing the Telegram tab, popup blocking, cancellation, expiry,
  offline recovery, reload/remount and a superseded link.
- Reconnect a disabled channel, test an account without a username, and ensure
  an existing verified channel still delivers without reconnecting.

Automated provider calls use fixtures. A real Telegram consent/exchange smoke
test requires the manually provisioned client credentials and registered URLs.
