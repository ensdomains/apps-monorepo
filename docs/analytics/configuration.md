# Configuration

| Deployment | Browser configuration | Upload project |
| --- | --- | --- |
| Production, both apps | Mainnet `.env.mainnet`, same production `VITE_PUBLIC_POSTHOG_KEY` | [ENS Apps — Production](https://eu.posthog.com/project/109100), ID `109100` |
| Staging, both apps | Sepolia `.env`, same separate staging key | [ENS Apps — Staging](https://eu.posthog.com/project/343384), ID `343384` |
| Normal local | Configured key can serve feature flags; analytics capture disabled | No upload credential needed |
| Deliberate local QA | Sepolia plus `VITE_PUBLIC_POSTHOG_DEBUG=true`; staging only | Staging |
| CI/E2E | Manager fake key/intercepted `.invalid` host for flags; Explorer key empty | `.env.ci` clears upload project ID |

Vite merges `.env` into `.env.mainnet`; production must override the staging key explicitly. `VITE_ENS_NETWORK` supplies environment separation: mainnet currently means production, Sepolia staging. Debug cannot enable local mainnet capture. Unknown networks/empty keys cannot capture. Keep `VITE_PUBLIC_POSTHOG_HOST` on the intended ingestion proxy (`edge.ens.domains`); verify routing and CSP. Staging flags/notices must be mirrored deliberately; do not change production flags to run QA.

## Consent, identity and capture

Native PostHog opt-in consent remains authoritative; feature flags work independently. After acceptance, the normalized connected wallet becomes `distinct_id`, never its executing HCA/Safe. Direct switches reset the old identity first; stable disconnect removes persisted identified-wallet state. Live capture checks wagmi against SDK identity. Async capture remembers consent and wallet identity at start and checks both again at capture. A→B→A and withdrawal/regrant may permit the original result once A and consent are current again. There is no custom consent-generation cookie or revision counter. PostHog native consent stays authoritative, including cross-tab capture checks; mounted consumers share one focus listener/poller.

Both apps use the bundled `posthog-js/dist/module.full.no-external` import for strict CSP. Native SPA `$pageview`/`$pageleave`, URLs/ENS paths/titles, UTMs, advertising IDs, referrers and saved attribution remain enabled. Explicit `ens_name` properties stay event-local and consent-gated. No record contents or extra wallet properties are added.

The SDK requires its click listener for native rageclick detection. Click-only autocapture has DOM text/attributes masked, and `before_send` discards ordinary `$autocapture`; forms/clipboard/dead-click capture and replay are disabled. Do not replace native pageviews with manual routing capture.

Filtering targets exact credential/signature/calldata fields and raw error objects, credential URL parameters/user-info, and raw RPC/contract-call sections in exception text. Useful error messages, parsed stacks and debug IDs survive. Person-property and saved flag-targeting envelopes receive the same narrow credential protection; ordinary attribution is retained.

Unhandled browser errors/rejections and caught React/router failures use PostHog Error Tracking; console-error capture is off. Server/Worker errors, failures before SDK initialization and errors swallowed by product code need separate reporting. Optional SDK throws/rejected promises are contained and product work never awaits analytics. A synchronous infinite loop on the main thread cannot be interrupted by try/catch or a promise timeout.

Consent-gated Intercom linkage sends `posthog_distinct_id` to support and `intercom_visitor_id` to the PostHog person, with up to 30 readiness attempts one second apart and stale-identity cancellation. If the widget stays unavailable, linkage waits for another wallet/consent synchronization trigger. Replay URLs are intentionally absent.

## Source-map uploads

Both apps use official `@posthog/rollup-plugin`, release names `ens-manager`/`ens-portal`, and `GITHUB_SHA` (CLI Git detection locally). Symbol-set mode matches the installed SDK's chunk-ID support. The same uploaded artifact must be deployed for correct symbolication.

Build-only inputs: private `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID` from the environment files, and `POSTHOG_HOST=https://eu.posthog.com` for the upload API. The key needs error-tracking write and organization read access; never put it in a `VITE_` variable. It is configured as a GitHub repository secret and passed only to release build steps. Staging Cloudflare builds still need the private build variable configured/verified. `POSTHOG_CLI_BINARY_PATH` is an optional QA override.

Uploads require all project/key/browser-token settings. Missing credentials leave local/CI builds working with a warning; configured upload failure blocks deployment. Successful uploads remove generated JS maps; do not serve them publicly. The Swarm mirror has no browser SDK key and skips uploads. Follow [PostHog's Vite guide](https://posthog.com/docs/error-tracking/upload-source-maps/vite); deployed original filename/function/line still needs the [QA check](qa.md).

Common configuration and identity synchronization are shared utilities with injected SDK/wallet inputs; app bindings retain their bundled instance and app-specific telemetry. Current-screen readiness is shared too, while actor subscriptions and screen semantics stay local.

If a previously identified wallet is still restoring, the SDK's initial pageview waits for resolution. Restoring the same wallet preserves its session and attribution; another wallet resets identity first. Native anonymous events may precede identification and merge through SDK identify. Errors/page-leave during unresolved identified restoration remain suppressed rather than buffered or sent under an unverified wallet.
