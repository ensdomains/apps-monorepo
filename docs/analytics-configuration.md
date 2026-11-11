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

The narrow filter removes exact credential/transaction-secret fields (`authorization`, cookies, password, access/refresh/ID tokens, API/private/secret keys, signatures and calldata) and raw error/stack fields. Matching named URL query/fragment parameters are redacted and URL user-info credentials are removed; ordinary paths, parameters, fragments and hosts remain intact. Nested properties and top-level `$set`/`$set_once` receive the same treatment. This is not a classifier for secrets in arbitrary strings: custom events must continue using the typed contracts and bounded technical diagnostics. Existing saved attribution/flag properties are retained; initialization applies only this same credential filtering before SDK flag requests, which bypass `before_send`.

Ordinary `$autocapture` and raw `$exception` events remain blocked. The SDK click listener remains enabled solely to retain native rage-click detection, with DOM text/attributes masked. Replay remains disabled before and after consent. The consent-gated Intercom integration sends `posthog_distinct_id` to Intercom and sets `intercom_visitor_id` on the PostHog person through `setPersonProperties`; the reciprocal link is refreshed after wallet identity changes. No replay link is sent while replay is disabled.

## Wallet identity

After opt-in and when remote analytics is enabled, identity is the lowercased connected wallet address. It is not the executing smart account. Direct wallet changes reset the old identity before identifying the new one. Reactive wagmi connection state handles account, network and connector changes, restored connections and app navigation; transitional reconnect states do not trigger a reset. A disconnected app drops a persisted identified wallet. The tracker reads wagmi connection state synchronously before capture to reject the brief gap before the provider effect updates SDK identity. Operation snapshots are invalidated on reset, including an A→B→A switch returning to the same distinct ID. Chain and connector are shared context, while wallet address is not duplicated as an event property. Manager's existing WalletLifecycle still handles its disconnect cleanup.

## Error tracking and source maps

Both Vite configurations and checked-in GitHub workflows were inspected; no active PostHog source-map upload configuration was found. Automatic exception capture remains disabled because raw wallet errors can contain RPC payloads. Transaction failure events send selected internal state/request labels and numeric context instead of raw payloads. The labels are SDK-owned strings, not a closed TypeScript enum. A later opt-in to exception tracking should first add payload sanitization and private source-map upload using CI-only credentials; do not expose upload credentials or enable raw exception capture as part of deployment setup.

## Intended test behavior changes

Provider tests now expect `identify(normalizedAddress)` without duplicate address person properties, and wallet captures contain automatic `source_app` instead of `wallet_address`. Consent integration tests explicitly select staging/debug because default local capture is now disabled. Assertions still verify real SDK consent gating and feature flags. New tests cover reset-before-switch, persisted disconnected identity cleanup, credential filtering, native attribution preservation and the environment gate.

Cross-tab QA must include two open apps using different wallet states. Shared consent is re-read by the SDK, while each app checks its own current wagmi connection against SDK identity before custom capture. Wallet-provider account-change delivery and queued native page events still require browser observation; helper tests alone do not establish cross-tab timing.
