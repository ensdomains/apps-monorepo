# Configuration

| Deployment | Browser configuration | PostHog project |
| --- | --- | --- |
| Production, both apps | Mainnet `.env.mainnet`, same production `VITE_PUBLIC_POSTHOG_KEY` | [ENS Apps — Production](https://eu.posthog.com/project/109100), ID `109100` |
| Staging, both apps | Sepolia `.env`, same separate staging key | [ENS Apps — Staging](https://eu.posthog.com/project/343384), ID `343384` |
| Normal local | Configured key can serve feature flags; analytics capture disabled | No remote analytics capture |
| Deliberate local QA | Sepolia plus `VITE_PUBLIC_POSTHOG_DEBUG=true`; staging only | Staging |
| CI/E2E | Manager fake key/intercepted `.invalid` host for flags; Explorer key empty | No real project ingestion |

Vite merges `.env` into `.env.mainnet`; production must override the staging key explicitly. `VITE_ENS_NETWORK` supplies environment separation: mainnet currently means production, Sepolia staging. Debug cannot enable local mainnet capture. Unknown networks/empty keys cannot capture. Keep `VITE_PUBLIC_POSTHOG_HOST` on the intended ingestion proxy (`edge.ens.domains`); verify routing and CSP. Staging flags/notices must be mirrored deliberately; do not change production flags to run QA.

## Consent, identity and capture

Native PostHog opt-in consent remains authoritative; feature flags work independently. After acceptance, the normalized connected wallet becomes `distinct_id`, never its executing HCA/Safe. New identities use EIP-55 checksummed addresses. An existing identified ID for the same wallet is retained, comparing address casing without resetting sessions, attribution or rollout assignments. Direct switches reset the old identity first; stable disconnect removes persisted identified-wallet state. Live capture checks wagmi against SDK identity. Async capture remembers consent and wallet identity at start and checks both again at capture. A→B→A and withdrawal/regrant may permit the original result once A and consent are current again. There is no custom consent-generation cookie or revision counter. PostHog native consent stays authoritative, including cross-tab capture checks; mounted consumers share one focus listener/poller. The saved native answer is rewritten on SDK load to renew its cookie, without answering a pending banner.

Both apps use the bundled `posthog-js/dist/module.full.no-external` import for strict CSP. Native SPA `$pageview`/`$pageleave`, URLs/ENS paths/titles, UTMs, advertising IDs, referrers and saved attribution remain enabled. Explicit `ens_name` properties stay event-local and consent-gated. Existing person properties `address` and `initial_address` are retained for flag-targeting compatibility; no wallet address is duplicated on ordinary custom events and no record contents are captured.

The SDK requires its click listener for native rageclick detection. Click-only autocapture has DOM text/attributes masked, and `before_send` discards ordinary `$autocapture`; forms/clipboard/dead-click capture and replay are disabled. Do not replace native pageviews with manual routing capture.

Filtering targets exact credential/signature/calldata fields and raw error objects, credential URL parameters/user-info, and raw RPC/contract-call sections in exception text. Useful error messages, parsed stacks and debug IDs survive. Person-property and saved flag-targeting envelopes receive the same narrow credential protection; ordinary attribution is retained.

Unhandled browser errors/rejections and caught React/router failures use PostHog Error Tracking; console-error capture is off; caught React errors still log locally as well as requesting consent-gated SDK reporting. Server/Worker errors, failures before SDK initialization and errors swallowed by product code need separate reporting. Optional SDK throws/rejected promises are contained and product work never awaits analytics. A synchronous infinite loop on the main thread cannot be interrupted by try/catch or a promise timeout.

Consent-gated Intercom linkage sends `posthog_distinct_id` to support and `intercom_visitor_id` to the PostHog person, with up to 30 readiness attempts one second apart and stale-identity cancellation. If the widget stays unavailable, linkage waits for another wallet/consent synchronization trigger. Replay URLs are intentionally absent.

## Error stack limitation

Native browser/React/router exception capture and targeted payload redaction remain enabled. Source-map uploading is deferred: this PR adds no upload plugin, CLI, build credentials or release-upload step. Production errors may have minified/unsymbolicated stacks. Build configuration otherwise retains its existing source-map behavior. The existing GitHub upload secret is retained but unused by these workflows; the [follow-up](remaining-work.md#source-map-upload-follow-up) covers future symbolication.

Common configuration and identity synchronization are shared utilities with injected SDK/wallet inputs; app bindings retain their bundled instance and app-specific telemetry. Current-screen readiness is shared too, while actor subscriptions and screen semantics stay local.

If a previously identified wallet is still restoring, the SDK's initial pageview waits for resolution. Restoring the same wallet preserves its session and attribution; another wallet resets identity first. Native anonymous events may precede identification and merge through SDK identify. Errors/page-leave during unresolved identified restoration remain suppressed rather than buffered or sent under an unverified wallet.

Feature flags work independently of consent. Exposure reporting has a known consent-transition gap: the installed SDK can mark a pre-consent read as reported even though capture is suppressed, preventing an anonymous visitor's later exposure event. Do not assume complete experiment exposure counts until that follow-up is fixed.

The pinned SDK caches each client's identity and prefers each origin's local storage over its shared cookie mirror. A disconnected sibling resetting its SDK does not change the active app's identity or restored session/attribution; a real-SDK regression covers this. Recheck that behavior before changing SDK storage settings.

Name selection intentionally includes normalized names, including unregistered destinations, after consent. Typing and abandoned queries are not recorded. Consented exception messages can also contain ENS names or wallet addresses under the same approved policy; credential and raw transaction-payload filtering still applies.

Submitted transactions are observed independently of Done/unmount: receipt polling is read-only and uses the transaction's configured timeout (120 seconds by default). Explorer treats a receipt timeout as unobserved; Manager single/bulk paths can still emit `renewal:stage_fail` for unknown outcomes and need a corrective follow-up. Registration recovery reuses the existing bounded on-chain verifier for unknown outcomes, including a live transaction actor that times out after its UI stops. Confirmed reverts and unsubmitted preparation/cancellation or wallet rejection skip extra verification. A missing hash after an ambiguous submission error does not prove nothing landed. No new signing or transaction submission occurs in these observers.
