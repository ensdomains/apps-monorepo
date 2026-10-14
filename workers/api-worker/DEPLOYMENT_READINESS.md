# API Worker deployment readiness

**Mainnet can be used for deployment smoke testing; the full service remains
incomplete.** `/health` reports liveness and the configured chain without DB,
RPC, KV, or provider calls. Existing API routes remain enabled; routes requiring
missing infrastructure fail closed. No cloud resources, deployed credentials,
DNS routes, workflows, or Workers Builds connections were changed. Independent
VAPID/JWT candidates were generated locally; see [LOCAL_CREDENTIALS.md](./LOCAL_CREDENTIALS.md).

## Environment and build contract

- Default `app-api-worker` remains Sepolia/development. Its variables, KV,
  queues, schedules, and existing `build`/`deploy` commands are preserved except
  for the requested sender/contact updates: `EMAIL_FROM_ADDRESS` is now
  `noreply@notifications.ens.domains` and `VAPID_SUBJECT` is
  `mailto:noreply@notifications.ens.domains` in both environments.
  `secrets.required` now declares the ten secret names used by this environment.
- `env.mainnet` targets `app-api-worker-mainnet`, with `CHAIN=mainnet` and the
  existing non-secret `EMAIL_FROM_ADDRESS` sender explicitly set.
  Its newly generated VAPID public key and public contact subject are configured;
  the matching private key still needs independent provisioning.
  All five producer/consumer definitions and both cron schedules are copied with
  independent mainnet queue names. `KV` is declared without an ID pending creation
  of a separate namespace. No Sepolia resource ID or stored data is copied.
  No production resource IDs, Manager/indexer URLs, or secret values are supplied.
  Eight shared secret names are declared independently in `secrets.required`;
  the Sepolia RPC and faucet funding key are excluded.
  `workers_dev` is enabled for testing at Cloudflare's default URL; version
  preview URLs remain disabled. No custom domain or DNS setup is needed.
- Bindings, vars, and secrets are non-inheritable. Compatibility settings and
  observability are inherited; schedules are explicitly repeated on mainnet.
  Before release, populate all required mainnet settings independently.
- Workers Builds already owns automatic default deployments and PR previews.
  Keep those existing GitHub connections and dashboard commands unchanged.
  There is no API deployment workflow in `.github/workflows`. `build.yml` and
  `test.yml` provide shared validation; API-only builds are not guaranteed by
  the former, and the latter requests `test:coverage`, which this package lacks.
  `linear-releases.yml` includes the API path in release tracking.

## Manual setup checklist

These are remaining actions for the environment owner; none were performed by
this code change. The first deployment installs both cron triggers and all queue
consumers, so complete the database/provider setup before deploying this config.

1. **Neon:** keep the existing Sepolia project and create a separate mainnet
   project with an empty database. Use the existing project's Postgres version as
   the initial compatibility baseline and choose the intended region, compute,
   access, and recovery/history settings. Create its own role/credentials and
   obtain the connection string for the exact project, branch, database, and role.
   This becomes mainnet's `DATABASE_URL`; Sepolia keeps its current URL.
2. **Database schema:** apply the checked-in Drizzle migrations to the new empty
   database. From `workers/api-worker`, securely set `DATABASE_URL` for that exact
   database, confirm the target, then run `pnpm exec drizzle-kit migrate`.
   Check any local `.env` first because `drizzle.config.ts` loads it. Do not use
   `drizzle-kit push`, regenerate migrations, or run the local `test:db` harness
   against a hosted database. Migration `0000` installs `pg_uuidv7` and schema
   defaults call `uuid_generate_v7()`; Neon lists the extension as supported.
   Verify migrations and that function succeeded before enabling traffic.
3. **Cloudflare KV:** create one fresh namespace for mainnet's `KV` binding,
   preferably named `app-api-worker-mainnet-KV`, then add its returned ID to
   `env.mainnet.kv_namespaces[0].id`. Keep Sepolia's current namespace unchanged.
   The omitted ID is intentional: Wrangler can auto-provision at deployment,
   but manual creation and recording the real ID makes the target reviewable.
   Do not copy existing cursor, lock, or rate-limit keys.
4. **Cloudflare Queues:** create these five queues (names already in Wrangler):
   `app-api-worker-mainnet-event-ingestion`,
   `app-api-worker-mainnet-telegram-delivery`,
   `app-api-worker-mainnet-email-delivery`,
   `app-api-worker-mainnet-push-delivery`, and `app-api-worker-mainnet-dlq`.
   Deploying the mainnet Worker attaches its producers/consumers and copied
   batch/retry/DLQ settings. Queue routing supports both environment prefixes.
5. **Sender/provider setup:** verify that SendGrid authorizes
   `noreply@notifications.ens.domains` before either environment starts using it.
   Complete the provider's sender/domain verification separately, including any
   required DNS records. Use a contact mailbox that is monitored for the VAPID
   subject. Confirm each Telegram bot/webhook belongs to its intended environment;
   changing a shared bot's webhook would affect the other environment.
6. **Secrets:** confirm the intended `app-api-worker-mainnet` Worker exists in
   the correct account (create the new named Worker if necessary without
   recreating existing Workers or GitHub connections), then provision all eight
   mainnet names from `secrets.required`:
   `DATABASE_URL`, `JWT_SECRET`, `POSTHOG_PERSONAL_API_KEY`, `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_WEBHOOK_SECRET`, `SENDGRID_API_KEY`,
   `SENDGRID_WEBHOOK_VERIFICATION_KEY`, and `VAPID_PRIVATE_KEY`. Use the generated
   mainnet bundle's matching VAPID private key and JWT candidate. Keep Sepolia's
   two additional secrets (`SEPOLIA_RPC_URL`, `ETH_PRIVATE_KEY`) on Sepolia only.
   Rotate Sepolia's VAPID pair/JWT together with the client/session changes in
   [LOCAL_CREDENTIALS.md](./LOCAL_CREDENTIALS.md); its current public key is still
   configured until that coordinated rotation.
7. **Remaining vars and code:** supply the verified mainnet `MANAGER_APP_URL`,
   `POSTHOG` host/query endpoint, and Telegram alert destination; decide whether
   marketing-list sync should be enabled before adding its list ID. `BASE_URL`
   currently has no runtime use. Mainnet ENS client/RPC support and verified
   indexer/bigname/contract configuration remain engineering work; adding secrets
   alone does not make SIWE/name operations functional. The hourly expiry cron
   will fail until that network configuration is available. Auth cleanup needs
   the migrated database. The schedules are copied, not evidence of readiness.
8. **Build and release test:** build the approved revision with
   `CLOUDFLARE_ENV=mainnet pnpm build:vite`, inspect
   `dist/app_api_worker/wrangler.json` for mainnet's name, resources, contact vars,
   and schedules, and deploy that artifact through the approved deployment path.
   Keep existing Workers Builds connections/default/PR-preview commands intact.
   Test `/health`, then DB-backed API operations, provider delivery to owned test
   accounts, queue ACK/retry/DLQ behavior, and cron logs. Never use staging resource
   IDs to fill a mainnet gap. Production Actions/release approvals remain a later
   PR; no production release workflow is added here.

When those setup steps are complete and you are ready to deploy manually, the
existing package command can select mainnet without adding a new script:

```sh
CLOUDFLARE_ENV=mainnet pnpm deploy
```

This builds mainnet first and then deploys that generated artifact. A plain
`pnpm deploy` builds/deploys the default Sepolia environment. For separate
build/deploy steps, build with `CLOUDFLARE_ENV=mainnet pnpm build:vite`, inspect
the artifact, then use `pnpm exec wrangler deploy` without attempting to retarget
it using `--env`. These commands are instructions for a later manual action;
they have not been run here.

## Neon: projects versus branches

**Recommendation for this Worker: separate projects for mainnet and Sepolia.**
These are different network datasets and notification recipients. Project-level
settings are shared by branches, while branch writes are isolated. A normal
branch starts with its parent's data; a schema-only branch avoids copying rows.
Two branches in one project are a valid simpler option for a temporary test, but
keep separate branch endpoints/credentials and do not treat a production data
clone as harmless test data. Do not reset one network's database from the other.
Branches remain useful for migration/PR testing *within* each project, with
delivery destinations scrubbed or test-only provider settings when data is cloned.
This is an operational recommendation, not a Neon requirement.

Sources: [Neon projects](https://neon.com/docs/manage/projects),
[branch isolation and schema-only branches](https://neon.com/docs/introduction/branching),
[supported Postgres extensions](https://neon.com/docs/extensions/pg-extensions),
[Wrangler automatic provisioning](https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning).

Run local checks from `workers/api-worker`:

```sh
pnpm typecheck
pnpm test
pnpm lint
pnpm build
# Inspect dist/app_api_worker/wrangler.json before changing build environments.
CLOUDFLARE_ENV=mainnet pnpm build:vite
# Inspect dist/app_api_worker/wrangler.json again: it must select mainnet.
```

The Cloudflare Vite plugin selects and flattens the Wrangler environment **at
build time**. The Vite environment/output directory remains `app_api_worker`
even when the Cloudflare environment changes. Each build replaces that artifact.
Never attempt to retarget a default artifact with `wrangler deploy --env mainnet`.
Before future deployment automation, verify the generated Worker name, `CHAIN`,
resource bindings, and triggers against the intended environment, then deploy
that exact artifact. No new deploy command or custom validator is added here;
artifact validation should accompany the future release workflow.

A successful mainnet bundle only proves compilation and environment selection.
It does not prove infrastructure or application readiness. Rebuild the default
environment after inspection to avoid leaving a mainnet artifact for existing
commands to consume.

## Repository inventory

This is a code/configuration inventory, not a claim that dashboard secrets exist
or are recoverable. Existing deployed secret values were not read. Required
secret names and generated types come from Wrangler configuration; usage below
was checked against application source.

- `KV`: faucet locks, email verification rate limits, expiry discovery cursors.
  Provision a separate mainnet namespace; do not copy the Sepolia namespace ID
  or its cursor data.
- Queue producers: `EVENT_INGESTION_QUEUE`, `TELEGRAM_QUEUE`, `EMAIL_QUEUE`,
  `PUSH_QUEUE`, `DLQ`. Current queue names are `app-api-worker-event-ingestion`,
  `app-api-worker-telegram-delivery`, `app-api-worker-email-delivery`,
  `app-api-worker-push-delivery`, and `app-api-worker-dlq`. All five have consumers.
  Delivery consumers use the DLQ; event ingestion currently does not. The `DLQ`
  producer binding has no direct application usage, but the DLQ consumer and
  dead-letter relationships are used. Provision separate production queues and
  configure producers, consumers, retry policies, and dead-letter relationships.
- Default crons: `0 */1 * * *` runs expiry discovery; `17 */3 * * *` cleans up
  expired authentication attempts. Mainnet repeats both schedules as requested;
  validate database, indexer, cursor, queue, and delivery setup before deployment.
- No D1, R2, Durable Object, service, or Hyperdrive bindings are configured.
  PostgreSQL/Neon is reached using `DATABASE_URL`; provision a separate database
  and review/apply checked-in Drizzle migrations through a separate approved
  process. A Worker release or rollback does not migrate or restore data.

Non-secret vars currently configured: `CHAIN`, `BASE_URL`, `EMAIL_FROM_ADDRESS`,
`MANAGER_APP_URL`, `POSTHOG` (host and query endpoint), `VAPID_SUBJECT`,
`VAPID_PUBLIC_KEY`, `TELEGRAM` (overflow alert chat), and
`SENDGRID_BROADCAST_LIST_ID` (currently empty, disabling optional marketing-list
sync). `BASE_URL` has no runtime usage today. All others are used. Mainnet needs
its own Manager URL, email sender, push identity, Telegram alert destination,
and analytics settings for the corresponding enabled features. Confirm the
public API URL separately before configuring domains or webhooks.

## Secrets and independent provisioning

`wrangler.jsonc` is the source of truth for required secret **names** in each
environment. Wrangler uses these declarations for type generation and validates
them in local development and deployment. Local `.dev.vars`/`.env` loading is
limited to declared names; `EMAIL_FROM_ADDRESS` is supplied by `vars`, not by a
secret. No values are committed or provisioned by declaring names. Future
mainnet RPC requirements must be added when the corresponding client support is
implemented.

- `DATABASE_URL`: required for auth, favorites, notifications, queue persistence,
  and auth cleanup. Provision production database credentials independently.
- `JWT_SECRET`: required for session signing/verification and email OTP digests.
  A fresh isolated mainnet installation can have an independent key. Recover
  the existing key if retaining sessions/data from an existing service; rotation
  invalidates issued JWTs and pending email verification digests unless a planned
  key transition is implemented.
- `VAPID_PRIVATE_KEY`: required with matching `VAPID_PUBLIC_KEY` and
  `VAPID_SUBJECT` for Web Push. Independently provision a pair for a new service.
  If retaining subscriptions, recover the matching private key first. Changing
  the public key requires clients to resubscribe; an arbitrary replacement
  private key cannot authenticate the existing push identity.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`: used for bot authentication,
  verification, delivery, webhooks, and overflow alerts. A separate production
  bot and independently provisioned webhook secret avoid staging interference.
  Confirm ownership and webhook registration; changing a bot/token affects
  existing channel links, and changing the secret requires a matching webhook
  registration update. Do not reconfigure an existing bot in this PR.
- `SENDGRID_API_KEY` and `SENDGRID_WEBHOOK_VERIFICATION_KEY`: used for verification
  email/delivery/optional contact sync and inbound signed event verification.
  Provision production sending access independently; investigate sender/domain
  ownership and recover the verification public key from the intended provider
  setup. Provider signing-key changes require coordinated verifier updates.
- `POSTHOG_PERSONAL_API_KEY`: used by name-search stats. Independently provision
  scoped production access and confirm the query endpoint/project/data source;
  do not silently reuse the development query configuration.
- `SEPOLIA_RPC_URL` and `ETH_PRIVATE_KEY`: existing Sepolia client/faucet settings.
  **Do not provision the faucet funding key on mainnet.** No production RPC
  binding is defined yet; choose it when implementing mainnet client support.
- `EMAIL_FROM_ADDRESS` is a configured var used by email delivery, despite also
  appearing among secret-like fields in the older generated types/example.

There is **no backfill key or backfill implementation in this repository** found
by searching tracked application/configuration sources. Its purpose, owner, and
whether it exists elsewhere require investigation; do not invent or rotate it.
Repository evidence alone does not identify any key that requires rotation.
Audit ownership/recoverability and suspected exposure separately before choosing
recovery or coordinated rotation.

## Code blockers and recommended next PR

1. Mainnet ENSv2 indexer and bigname endpoints are `null` in the shared network
   profile. `getConfig` rejects these gaps; shared configuration also checks for
   undeployed ENSv2 contract addresses. Supply verified mainnet deployments in
   a separate change. Never override these checks with staging endpoints.
2. The ENS client deliberately rejects all non-Sepolia chains until production
   RPC selection is implemented. `getConfig` never uses `SEPOLIA_RPC_URL` for
   another chain. Add a mainnet transport and verify chain identity before
   lifting the client guard. Auth and name routes currently depend on this client.
3. `/wallet/fund` and `/wallet/tokens` return 404 unless `CHAIN` is exactly
   `sepolia`, before accessing DB, KV, keys, or RPC. Keep mock minting and the ETH
   drip disabled on mainnet. Production wallet functionality needs a separate
   design, not a copied faucet.
4. Queue routing in `src/queues/index.ts` selects the configured environment's
   queue-name prefix and is tested through Cloudflare's queue harness.
   Provision the declared mainnet queues. Producers and DLQ replay select bindings,
   so isolated bindings are also essential. Delivery providers and notification
   links use runtime settings; configure them before enabling consumers.
5. Review SIWE domain/chain isolation: the domain allowlist currently includes
   both development and production domains. Notification test dispatch uses
   Vite's `import.meta.env.DEV`, not `CHAIN`; a normal Sepolia production-mode
   build already disables it. Preserve that behavior while reviewing mainnet.
6. Keep the existing default-runtime type snapshot for this initial change.
   Regenerating aggregate types while mainnet is incomplete makes its missing
   resources optional throughout the existing API and forces unrelated changes.
   Complete mainnet's binding contract before regenerating checked-in types.
   `secrets.required` already makes secret-name generation reproducible without
   local secret files. TypeScript success does not certify mainnet completeness.
   TypeScript success does not certify mainnet binding completeness.

The next PR should complete verified mainnet resource configuration,
RPC support and queue routing with focused tests, after infrastructure owners
provide the missing resources/endpoints. Then add a separate release workflow
that builds with `CLOUDFLARE_ENV=mainnet`, validates the generated artifact,
deploys an approved tagged revision, and keeps production credentials isolated
from Workers Builds/PR previews. Include migration and rollback procedures.

For the first deployment-system test, follow the checklist and check `/health`
on the resulting workers.dev URL. This verifies build, deployment, and routing,
not provider or database readiness. Queue consumers and crons are now configured
to start on deployment. Do not attach the unfinished service to production client
traffic.

## Local validation (2026-10-13)

- `pnpm typecheck`: passed.
- `pnpm test`: 274 passed, 31 skipped, including both environments' queue
  routing, health, and push provenance. Real DB tests are not enabled.
- Shared-schema typecheck/lint and all 19 tests passed. Both Node credential
  generator tests passed (key matching/encoding, independent files, permissions,
  and overwrite refusal).
- `pnpm lint`: passed with two existing complexity warnings in notification
  creation and logger serialization.
- `pnpm build`: passed; generated name, vars, KV, queues, and crons match the
  default configuration with the requested sender/contact updates.
- `CLOUDFLARE_ENV=mainnet pnpm build:vite`: passed with expected warnings for
  missing vars and local secret values. Mainnet's KV binding has no ID yet;
  queue names and cron definitions are configured. The workers.dev test endpoint is enabled. Resources
  are not required to compile; their absence still blocks release readiness.
- Wrangler secret-name type generation was checked locally: the eight shared
  secrets are required and the Sepolia RPC/faucet keys are excluded from mainnet.
  The checked-in default-runtime snapshot is retained to keep this change focused.
- The default build was rerun afterward and its ten secret-name requirements
  verified. Missing local secret values produce expected warnings in builds and
  tests; tests still use their existing controlled fixtures. Nothing was deployed.

## References

- [Deployment strategy guide](https://gist.github.com/svemat01/ad96a15322d0a433fded5baa54025d87)
  (our default-Sepolia / named-mainnet structure takes precedence over examples).
- [Wrangler environments and inheritance](https://developers.cloudflare.com/workers/wrangler/environments/)
- [Cloudflare Vite environment selection](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/)
- [Required secret-name declarations](https://developers.cloudflare.com/workers/wrangler/configuration/#secrets-configuration-property)
- [Local testing conventions](./TESTING.md)
