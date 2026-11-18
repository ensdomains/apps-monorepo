# QA checklist

Use a staging project/Sepolia build and disposable funded owner wallets A/B. No synthetic production events or mainnet paid operations. On local Sepolia, enable `VITE_PUBLIC_POSTHOG_DEBUG=true`; normal local capture is disabled. Inspect SDK requests in DevTools and staging PostHog live events. Manager exposes `window.posthog` for existing E2E/debug tooling; Explorer can be inspected through network requests. Automated browsers may require a test-only bot-filter override; production filtering stays unchanged.

Filter PostHog by `environment=staging`, `source_app`, and the operation's `flow_id`; sort chronologically. Verify `distinct_id`, normalized `ens_name` for single-name actions, protocol and outcome timing. Treat these as separate evidence: UI observed, outgoing event observed, ingested event inspected. Passing tests alone verifies none of those browser journeys.

Pre-consent flag reads can suppress later native exposure events. See [remaining work](remaining-work.md).

## Highest-risk scenarios

| Navigate / setup | Action and expected sequence | Must not happen |
| --- | --- | --- |
| Either app; fresh browser then saved consent | Pending/reject: flags work without optional events. Accept: current visible observation only. Withdraw/regrant: capture stops while denied; no pre-consent work replayed | No pre-consent history or replay; no retroactive duration visit when grant occurs on payment |
| Either app; wallets A/B, two app tabs | Connect, disconnect, switch A→B→A; restore after reload; change network/connector; withdraw in another tab during a pending operation | No A outcome under B; returning to A may allow its pending result. Withdrawal blocks capture while denied; regrant may allow work initially started with consent. Smart account must not become wallet identity |
| Manager HCA; wallets A/B | Delay the reveal price read for A, switch to B, and let A's queued transaction fail | No `transaction:execution_end` for A's run under B. An early rejection while the initiating wallet remains connected still produces one event. |
| Manager register available test name; EOA and HCA | Entry/duration/payment → `flow_start` → applicable setup/approval/commit/cooldown/registration/verification stages → `flow_complete` after confirmed reveal/verification | No completion on submission, screen entry or optional setup. Reject approval: `stage_fail(approval)`, retry then success. Reject optional primary setup after registration: required completion stays once |
| Explorer `/register?name=<test-name>` | Available duration form → entry/duration; connect → payment only, without repeating entry/duration. Switching A→B or starting a new flow gets fresh observations. Reject commit/approval, retry, leave while reveal is pending, reload recovery | No duplicate entry on anonymous identification; no missing completion solely because Done was not clicked; resume uses `flow_resume` in a new observed segment |
| Both apps; V1 and V2 single renewals | Entry/duration/payment → start → approval/execution/verification as applicable → completion. Compare `protocol_version`, `ens_name` and chain to the actual write | Name/protocol cannot change to a new route while awaiting receipt; rejection or a reverted receipt produces no success. Receipt/fill observation timeout keeps retry available without a `renewal:stage_fail` event |
| Manager bulk; >1 chunk of eligible V2 names | Start has V2 counts; confirm first chunk, fail next, retry → final completion with unique full count. Leave before final receipt/animation | Partial failure is not full completion; landed chunks not paid/counted twice. No name arrays |
| Explorer bulk; mixed V1/V2 | Modal disclaimer/settings/summary views → start with `protocol_version=mixed` and actual version counts → receipt confirmations → final completion | Approval confirmations are not renewed names; no per-name expiry claim from batch receipt count; no `ens_name`/arrays on bulk events |
| Both profile editors; controlled name | Open → `edit_view`; first actual change → one `edit_start`; accept save/review → `save_start`; confirmed records → `records_update` + `save_complete(records)` | No events per keystroke, no record values. Leave without editing: view only. Rejected save: `save_fail`, then another start on retry |
| Manager profile; image-only, combined image/records, resolver replacement | Test each accepted save. Image-only completion follows last successful publish; combined waits for records too. Fail upload/preparation; close dialog or navigate to another name while pending | Image-only cannot emit record-write success. Cache refresh/onUpdated failure cannot undo already completed publication. Old result retains initiating name/identity |
| Explorer primary name/subnames/resolver/registry roles/DNS sync | Perform each on controlled V1/V2 names; expect the dedicated outcome after receipt, matching operation name/chain/action | No success for rejected writes; no guessed name for resolver-wide permissions. Forward record write alone is not reverse primary-name success |
| Both searches; mouse/keyboard/popover/modal | Select a name/address/resolver. Canonical selection includes name only for name destinations. Manager also emits legacy name event for statistics | No keystroke/unsubmitted-query capture; do not count canonical and legacy as two searches |
| Manager migration and NFT | Migration entry/start, renewal/execution stages, partial retry → actual migrated/copied/ineligible completion counts. Start NFT claim/reconciliation/download then switch wallet or grant consent during wait | No current-wallet attribution of old NFT outcome; recovery/storage must still work; Explorer upgrade link is not migration completion |
| Either app; slow/blocked Intercom | With saved consent, delay widget startup; verify eventual reciprocal linkage and one successful boot event for current identity. Switch/withdraw during delay | No link under stale identity; blocked widget must not affect app behavior |
| Manager pricing banner; `TEMP_PREMIUM_NAME_STATS` enabled | Force the search-statistics request to fail upstream; favorites remain visible while unavailable search demand is absent | Unavailable searches must not display as zero or hide favorites |
| Either app; DevTools/network blocking | Navigate routes and leave page; inspect native pageview/pageleave/rageclick. Block analytics requests and repeat product actions | No ordinary click/form events or replay; optional SDK/network failure must not block product work |

## Exceptions

Before consent, `setTimeout(() => { throw new Error('ENS QA before consent') }, 0)` must produce no report. Accept; repeat with a distinct message and `Promise.reject(new Error('ENS rejection QA'))`: expect `$exception`, correct app/environment, useful messages/frames and no credentials/RPC body. Withdraw and repeat: no report. `console.error` alone intentionally does not count.

Exercise caught route/render failures too. Source-map upload and deployed symbolication are deferred; production stacks may be minified/unsymbolicated. A DevTools-created error can prove ingestion, not original application source locations. Do not enable replay for this check.

## Verification status

Automated checks passed after the main merge; the subsequent Explorer wallet-connection fix passed 30 focused tests, typecheck and build. Passing checks are not browser or ingestion evidence.

| Evidence | Status / limit |
| --- | --- |
| Browser QA reported on November 13 | Normal V2 registration/renewal/profile outcomes; Manager registration after leaving; Explorer renewal after closing both sheets; profile write succeeding with its analytics suppressed after consent withdrawal; exception ingestion and returning-wallet/session/attribution checks. Receipt/indexer and staging events were inspected. These results predate the latest main merge and Explorer view fix. Historical temporary evidence files are no longer available after the runtime restart. |
| Current merged code | Browser replay is outstanding, including anonymous→wallet entry deduplication, detached completion, returning identity, consent changes during pending work and failure/retry. Actual deployed cross-subdomain behavior and cookie-expiry renewal are not established by local-port tests. |
| Timeout recovery | Automated EOA/HCA detached registration regressions passed; a browser-induced timeout was not tested. Hold receipt observation, leave the screen, let observation time out, then expect one completion only after successful verification. |
| Fixture-dependent / deferred | V1/mixed renewals, multi-chunk partial recovery, eligible migration/NFT/DNS and subregistry writes need fixtures. Source-map upload/symbolication is deferred. |

Start current-build QA with the entry, consent/identity and detached-completion scenarios above, then exercise failure/retry and fixture-dependent paths. No exactly-once delivery or closed-browser completion guarantee is claimed.
