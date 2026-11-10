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

The installed SDK 1.404.1's `autocapture._captureEvent` returns before running its rage-click detector when autocapture is false. Consequently autocapture retains its click listener with all text and element attributes masked, while `before_send` drops every ordinary `$autocapture` event. `$rageclick` is retained with DOM text, element chains and selectors removed. Forms and clipboard capture are disabled by the click-only allowlist. Dead-click capture is disabled pending genuine browser QA. There is no custom interaction detector.

Native `$pageview` uses `history_change`; native `$pageleave` is enabled. There is no manual pageview emitter. Automatic URLs retain the approved production, Sepolia, ens.dev and local origins and allowlisted static path segments (other origins become `[external]`); dynamic segments become `:value`. Query strings and fragments, page titles, DOM content, campaign free text and initial person-property payloads are removed before capture. This intentionally trades campaign detail for predictable minimization. Replay remains disabled after consent as well as before it. Raw exception autocapture is disabled; use bounded technical events instead of arbitrary exceptions or transaction payloads.

Filtering covers the full SDK envelope, including top-level `$set`/`$set_once`, plain `title`, session-entry campaigns and advertising click IDs. Native campaign/referrer persistence is disabled. Before the first flag request, SDK initialization removes legacy initial-attribution buckets and sanitizes stored flag-person overrides while preserving unrelated manual flag properties. This matters because flag requests bypass `before_send`; keep full-envelope and flag-body regressions when updating the SDK. Attribution-based flag targeting is intentionally unavailable under this policy.

The existing shared opt-in cookie remains the only consent framework. Declining resets identity, then persists denial; accepting never replays earlier events. SDK capture checks consent and the app wrappers independently gate it. Cross-tab changes are observed on focus and every five seconds by the existing subscription. Network transmission of already queued requests after withdrawal still requires browser-level QA; no claim is made that an already dispatched request can be recalled.

Explicit consent choices also replace `ens_analytics_consent_generation`, parent-scoped on `ens.domains`/`ens.dev`, with the same path/security policy and one-year lifetime. It records a consent generation, never an account identity, and is not sent to PostHog. Pending-operation guards read it synchronously so withdrawal/regrant between polls still invalidates old outcomes. SDK initialization and wallet resets do not replace it. Existing granted consent without this metadata remains valid; inaccessible cookie state suppresses optional delayed capture. Both apps must deploy this behavior for cross-app invalidation.

## Wallet identity

After opt-in and when remote analytics is enabled, identity is the lowercased connected wallet address. It is not the executing smart account. Direct wallet changes reset the old identity before identifying the new one. Reactive wagmi connection state handles account, network and connector changes, restored connections and app navigation; transitional reconnect states do not trigger a reset. A disconnected app drops a persisted identified wallet. The tracker reads wagmi connection state synchronously before capture to reject the brief gap before the provider effect updates SDK identity. Operation snapshots are invalidated on reset, including an A→B→A switch returning to the same distinct ID. Chain and connector are shared context, while wallet address is not duplicated as an event property. Manager's existing WalletLifecycle still handles its disconnect cleanup.

## Error tracking and source maps

Both Vite configurations and checked-in GitHub workflows were inspected; no active PostHog source-map upload configuration was found. Automatic exception capture remains disabled because raw wallet errors can contain RPC payloads. Transaction failure events send selected internal state/request labels and numeric context instead of raw payloads. The labels are SDK-owned strings, not a closed TypeScript enum. A later opt-in to exception tracking should first add payload sanitization and private source-map upload using CI-only credentials; do not expose upload credentials or enable raw exception capture as part of deployment setup.

## Intended test behavior changes

Provider tests now expect `identify(normalizedAddress)` without duplicate address person properties, and wallet captures contain automatic `source_app` instead of `wallet_address`. Consent integration tests explicitly select staging/debug because default local capture is now disabled. Assertions still verify real SDK consent gating and feature flags. New tests cover reset-before-switch, persisted disconnected identity cleanup, URL filtering and the environment gate.

Cross-tab QA must include two open apps using different wallet states. Shared consent is re-read by the SDK, while each app checks its own current wagmi connection against SDK identity before custom capture. Wallet-provider account-change delivery and queued native page events still require browser observation; helper tests alone do not establish cross-tab timing.
