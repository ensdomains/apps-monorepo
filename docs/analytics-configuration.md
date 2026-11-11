# Analytics configuration and identity

The bundled `posthog-js/dist/module.full.no-external` import remains mandatory for both apps' CSP. The shared configuration and consent helpers live in `packages/utils/src/posthog/analyticsConfiguration.ts`; no SDK instance or dependency is added to utils.

## Deployment setup

| Deployment | Environment file | `VITE_PUBLIC_POSTHOG_KEY` | `VITE_PUBLIC_POSTHOG_DEBUG` |
| --- | --- | --- | --- |
| Production Manager and Explorer (mainnet) | `.env.mainnet` | Same production project token | unset |
| Staging Manager and Explorer (Sepolia) | `.env` | Same separate staging project token | unset |
| Normal local development | Either | Flags may initialize with the configured token; capture disabled | unset |
| Deliberate local staging QA | `.env.local` with Sepolia | Staging token | true |
| CI / E2E | `.env.ci` | Manager uses a fake token and intercepted `.invalid` host for local flag overrides; Explorer key is empty | unset |

There is one project key per deployment. `VITE_ENS_NETWORK=mainnet` currently means production; `sepolia` means staging. The same distinction supplies event `environment` metadata. Local mainnet capture remains disabled even with the debug override. Unknown networks and empty keys cannot capture. Do not run synthetic QA against a production build/key.

Vite merges `.env` into `.env.mainnet`, so mainnet must explicitly override the project token. Both mainnet files now contain the verified production project token. Both base `.env` files contain the separate staging project token. Manager CI initializes the SDK with a fake token so the existing Playwright flag overrides can run; its `.invalid` host is intercepted in Manager and cross-app fixtures. Explorer CI keeps its key empty. Tokens are public browser configuration, not personal API keys.

Keep `VITE_PUBLIC_POSTHOG_HOST` pointed at the appropriate ingestion proxy/host and verify its routing and CSP. Feature flags initialize independently of consent/capture when a key is configured. Essential flag definitions and notice payloads must be mirrored into the staging project deliberately; no production flags or behavioral capture settings were changed.

On 2026-11-10, the existing project 109100 was renamed [ENS Apps — Production](https://eu.posthog.com/project/109100) and [ENS Apps — Staging](https://eu.posthog.com/project/343384) was created as project 343384. Both apps use their respective public tokens through the existing `edge.ens.domains` proxy; the staging ingestion region is EU. No billing changes were made. Staging feature flags, surveys and dashboards have not been copied; proxy connectivity and actual staging ingestion still require verification.

## SDK behavior and privacy

The installed SDK 1.404.1's `autocapture._captureEvent` returns before running its rage-click detector when autocapture is false. Consequently autocapture retains its click listener with all text and element attributes masked, while `before_send` drops every ordinary `$autocapture` event. `$rageclick` is retained with SDK DOM text/attribute masking. Forms and clipboard capture are disabled by the click-only allowlist. Dead-click capture is disabled pending genuine browser QA. There is no custom interaction detector.

Native `$pageview` uses `history_change`; native `$pageleave` is enabled. There is no manual pageview emitter. Native URLs, ENS route/name information, titles, referrers, UTMs, advertising click IDs and ordinary SDK metadata are preserved. Campaign and referrer persistence are enabled, including initial attribution used by feature flags.

The narrow filter removes exact credential/transaction-secret fields (`authorization`, cookies, password, access/refresh/ID tokens, API/private/secret keys, signatures and calldata) and raw error objects. Matching named URL query/fragment parameters are redacted and URL user-info credentials are removed; ordinary paths, parameters, fragments and hosts remain intact. Nested properties and top-level `$set`/`$set_once` receive the same treatment. This is not a classifier for secrets in arbitrary strings: custom events must continue using the typed contracts and bounded technical diagnostics. Existing saved attribution/flag properties are retained; initialization applies only this same credential filtering before SDK flag requests, which bypass `before_send`.

Ordinary `$autocapture` events remain blocked. Native `$exception` events are enabled after the existing consent gate, preserving type, message, parsed stack frames and debug IDs. Raw RPC/contract-call body sections and named credentials are removed from exception messages. The SDK click listener remains enabled solely to retain native rage-click detection, with DOM text/attributes masked. Replay remains disabled before and after consent. The consent-gated Intercom integration sends `posthog_distinct_id` to Intercom and sets `intercom_visitor_id` on the PostHog person through `setPersonProperties`; the reciprocal link is refreshed after wallet identity changes. No replay link is sent while replay is disabled.

## Wallet identity

After opt-in and when remote analytics is enabled, identity is the lowercased connected wallet address. It is not the executing smart account. Direct wallet changes reset the old identity before identifying the new one. Reactive wagmi connection state handles account, network and connector changes, restored connections and app navigation; transitional reconnect states do not trigger a reset. A disconnected app drops a persisted identified wallet. The tracker reads wagmi connection state synchronously before capture to reject the brief gap before the provider effect updates SDK identity. Operation snapshots are invalidated on reset, including an A→B→A switch returning to the same distinct ID. Chain and connector are shared context, while wallet address is not duplicated as an event property. Manager's existing WalletLifecycle still handles its disconnect cleanup.

## Error tracking and source maps

Browser error tracking captures unhandled errors and rejected promises. Console-error capture is disabled. React caught-error hooks and TanStack Router's `defaultOnCatch` report handled render/route failures through the same safe `captureException` adapter. A WeakSet suppresses duplicate manual reports of the same Error object across these hooks; global uncaught failures use the native handler. Consent, wallet synchronization and deployment gating continue to apply. Errors before SDK initialization, server/Worker errors and errors handled entirely by product code are not automatically covered by the browser SDK.

Both apps use the official `@posthog/rollup-plugin` for debug-ID injection and source-map upload. Uploads run only when the build has a configured SDK token, `POSTHOG_API_KEY` and `POSTHOG_PROJECT_ID`. Project IDs are set in `.env` (343384, staging) and `.env.mainnet` (109100, production); CI explicitly clears the ID. `POSTHOG_HOST=https://eu.posthog.com` is the upload API host, separate from the browser ingestion proxy. Manager and Explorer use `ens-manager` and `ens-portal` release names; the version uses `GITHUB_SHA` on releases and CLI Git detection otherwise. Symbol-set mode is intentional for compatibility with the installed browser SDK's chunk-ID support.

Set `POSTHOG_API_KEY` as a private GitHub repository/release-environment secret and as a private Cloudflare build variable for staging previews. It requires error-tracking write and organization read access to the intended projects; never use a public `phc_` token or a `VITE_` variable. The release workflows pass the secret only to the build step. Missing credentials leave local/CI builds working and print an upload warning; a configured upload failure fails the build before deployment. Successful uploads delete generated JS maps, which must not be publicly served. The Swarm mirror has no SDK key, so it skips uploads. `POSTHOG_CLI_BINARY_PATH` is an optional build-only override for testing the uploader.

Source-map setup follows [PostHog's Vite integration](https://posthog.com/docs/error-tracking/upload-source-maps/vite). Validate a staging exception's original filename/function/line in Error Tracking after deploying the exact uploaded build; rebuilding before deployment can produce different debug IDs.

## Error-tracking QA

On 2026-11-11, focused analytics tests passed (utils 30, Manager 44, Explorer 22), as did all three typechecks and both application builds. The real uploader accepted Manager and Explorer source maps in staging; no generated `.map` files remained in either deployment output. A local Manager browser check observed native unhandled errors and promise rejections with stack frames and staging metadata, and no reports before opt-in or after withdrawal. Its requests were intercepted, so this does not establish staging error ingestion or deployed symbolication. The automated browser required a test-only SDK bot-filter override; production bot filtering is unchanged.

1. Deploy a staging build produced with the upload credential. In normal local development, explicitly enable staging capture with `VITE_PUBLIC_POSTHOG_DEBUG=true` on Sepolia.
2. Before accepting analytics, run `setTimeout(() => { throw new Error('ENS error tracking QA before consent') }, 0)` in DevTools. No `$exception` should be sent.
3. Accept analytics and run the same command with a distinct message, then `Promise.reject(new Error('ENS rejection QA'))`. Both should produce `$exception` with `environment=staging` and the correct `source_app`; `console.error` alone intentionally does not.
4. In staging Error Tracking, inspect an error originating in the deployed application bundle. Its frames should resolve to the original source filename, function and line. A DevTools-created error can verify ingestion but has no uploaded application source map. Check that credentials/RPC bodies are absent and useful messages/stacks remain.
5. Withdraw consent and trigger another error. It must not produce a report. Replay must remain disabled throughout. Repeat in Explorer and check caught route/render failures through its existing error UI.

`POSTHOG_API_KEY` has been configured as a GitHub repository secret. Staging Cloudflare build-variable setup and exact deployed-build symbolication remain to be verified; no deployment was performed during this change.

## Intended test behavior changes

Provider tests now expect `identify(normalizedAddress)` without duplicate address person properties, and wallet captures contain automatic `source_app` instead of `wallet_address`. Consent integration tests explicitly select staging/debug because default local capture is now disabled. Assertions still verify real SDK consent gating and feature flags. New tests cover reset-before-switch, persisted disconnected identity cleanup, credential filtering, native attribution preservation and the environment gate.

Cross-tab QA must include two open apps using different wallet states. Shared consent is re-read by the SDK, while each app checks its own current wagmi connection against SDK identity before custom capture. Wallet-provider account-change delivery and queued native page events still require browser observation; helper tests alone do not establish cross-tab timing.
