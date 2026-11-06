# ENS product analytics — WEB-1251 handoff

This is an implementation with automated verification and limited local browser QA. Wallet transactions and staging ingestion remain release acceptance work. No deployment, production setting, billing, integration, dashboard or GitHub state was changed. The temporary QA collector bound only to 127.0.0.1, used a fake token, and retained only selected sanitized metadata in memory; it was not a PostHog staging project.

## Implementation map

- `packages/utils/src/posthog/eventContracts.ts`: single TypeScript event vocabulary, including retained legacy events. App adapters use the bundled SDK singleton; no analytics backend, schema runtime, identity service or new dependency.
- `createAnalyticsTracker.ts`: consent/environment gate, bounded scalar allowlist, best-effort capture, and initiating-identity guards for asynchronous work. SDK outages cannot block product actions.
- `analyticsConfiguration.ts`, `walletIdentity.ts`: shared opt-in consent, normalized connected-wallet identity, reset before account replacement, environment policy and automatic-property sanitization.
- App `lib/posthog/config.ts` / `provider.tsx`: SDK and wagmi wiring, native SPA pageviews/pageleaves. Click listener retained for native rageclick detection; ordinary autocapture events are discarded. Replay, dead clicks and raw exception autocapture remain off.
- Manager failed-run reporting is now `transaction:execution_end` with run ID, status, stage, chain, method and attempt count. Full payload, errors, transaction hashes, calldata and timeline are excluded. Runs without an observed initiating context are suppressed.
- API Worker returns an unavailable statistics response (503) instead of a fabricated zero on failed/malformed PostHog responses. Manager already treats this as a query error and does not render unavailable demand data.

See the [Manager matrix](analytics-manager-matrix.md), [Explorer matrix](analytics-explorer-matrix.md), and [configuration guide](analytics-configuration.md) for exact source locations, per-app steps and QA sequences. These matrices were established before the app instrumentation and updated afterward.

## Event registry

Every emitted event has `source_app: manager | explorer`, `environment: production | staging`, and `analytics_version: 1`. Chain/connector context is registered while connected. UUIDs are opaque; no names or record values are added to new product events. Properties below are additional to common metadata. Not every type-supported event is emitted by every flow.

| Event(s) | Properties and exact semantics | App |
| --- | --- | --- |
| `registration:flow_view`, `flow_start`, `flow_resume`, `flow_retry` | `flow_id`; view = flow created; start = explicit submission; resume = observed recovery; retry = explicit retry. Optional `registration_method`, `chain_id` where available. | Manager; Explorer start/resume/retry |
| `registration:step_view`, `step_result` | `flow_id`, controlled `step`; result has `outcome`, `is_retryable`, bounded `error_code` where available. Significant UI/machine stages only; failure is an attempt, not terminal business failure. | Both |
| `registration:payment_option_select` | `flow_id`, `payment_asset`, `funding_source`; explicit payment selection. | Manager |
| `registration:flow_complete` | `flow_id`, `item_count: 1`; verified required registration, before optional post-registration setup. Deduplicated within the live flow. | Both |
| `renewal:flow_view`, `flow_start`, `flow_retry`, `step_view`, `step_result` | Same correlation/result convention; Manager supports payment and execution, plus `is_bulk`, `completed_count`/`item_count` on partial batch failures. Explorer tracks receipt-backed transaction stages. | Both; see matrices for app support |
| `renewal:payment_option_select` | Explicit selection, same payment properties as registration. | Manager |
| `renewal:flow_complete` | `flow_id`, `item_count`; confirmed renewal, all batch work complete. Explorer means all required receipt callbacks completed, not separately indexed expiries. | Both |
| `migration:flow_view`, `flow_start`, `flow_retry`, `step_view`, `step_result`, `flow_complete` | `flow_id`; completion has actual result counts (`item_count`, `migrated_count`, `copied_count`, `ineligible_count`); partial results are not all-selected success. | Manager |
| `migration:manager_open` | `is_wrapped`; click opens Manager's migration UI. This is not a migration outcome or a sequential app funnel. | Explorer |
| `name_search:result_select` | `source`, optional `name_length`, `result_type`; explicit chosen destination, not keystrokes or availability polling. | Both |
| `profile:records_update` | `operation_id` and/or `chain_id`, optional `record_count`; successful save completion, excluding record values. | Both |
| `profile:primary_name_update` | `operation_id` and/or `chain_id`; confirmed primary-name mutation. | Both |
| `subname:name_create` | `chain_id`; receipt-backed create completion. | Explorer |
| `resolver:configuration_update` | `chain_id`, controlled `action` (change/link/unlink/roles); successful receipt-backed operation. | Explorer |
| `roles:permissions_update` | `chain_id`, `action: grant | revoke`; receipt-backed registry permission update. | Explorer |
| `dns:manager_sync` | `chain_id`; successful DNS manager synchronization. | Explorer |
| `notifications:preferences_update` | `operation_id`; successful preferences PATCH, no destinations or preference values. | Manager |
| `wallet:connect`, `wallet:disconnect` | Connected callback/disconnect; chain and connector, no duplicated wallet address sent. Reactive identity synchronization also covers account/network/connector changes without fabricating connects. | Both |
| `transaction:execution_end` | `operation_id`, `outcome: failure | cancelled`, `failure_stage`, optional `chain_id`, `execution_method`, `attempt_count`; bounded failed TM run. Not an overall business-flow failure. | Manager |
| `$pageview`, `$pageleave`, `$rageclick` | SDK native events with sanitized automatic properties. No manual recreation. Rageclick functionality requires staging browser confirmation. | Both |
| Retained legacy events | `name:search_selected` retains normalized `name` and `source: header_search` for name-popularity dependency. Existing NFT/Intercom/DNSSEC event names remain; DNSSEC raw `name` is removed at transport. | Existing app callers |

Verb vocabulary: view = observed meaningful surface/stage; start = explicit intent; select = deliberate choice; result = step outcome; retry/resume = observed recovery; complete = confirmed required outcome; update/create/sync = successful simple operation; open = outgoing handoff. Leaving a page is never synthesized into a failure. Duration can be computed between correlated timestamps; no clock-dependent business decisions are added.

## Configuration and remote setup

**Capture is disabled until deployment explicitly selects an analytics environment.** Production Manager and Explorer must both set `VITE_PUBLIC_ANALYTICS_ENV=production` and use the same production project token. Staging requires `VITE_PUBLIC_ANALYTICS_ENV=staging` plus a distinct `VITE_PUBLIC_POSTHOG_STAGING_KEY`; it never falls back to the production key. Local staging capture additionally requires `VITE_PUBLIC_ANALYTICS_DEBUG=true`. Normal local/CI runs remain flags-only. See `.env.example` and the configuration guide.

Read-only account inspection on 2026-11-06 found ENS App organization `019b278e-62fe-0000-8810-6947910510c3`, combined project **109100**, one visible non-demo project, and `organizations_projects` limit **1**. A second same-organization project therefore needs an owner to resolve the entitlement before creating **ENS Staging**. ENS Labs has a different entitlement, but moving analytics to another organization was not authorized. No project or billing change was attempted.

Owner setup: resolve entitlement, create the staging project, configure its token and ingestion host/proxy in both deployments, copy essential flags and notice payloads, verify CSP connectivity, then perform the acceptance checklist below. Keep production/staging tokens out of shared CI defaults. Review retention and existing integrations separately; this change does not approve additional processing. Raw wallet addresses remain personal data and become PostHog identity only after consent. No SIWE dependency or identity pseudonym service is introduced.

The current name-search endpoint remains keyed to legacy `name:search_selected` / `properties.name` until its saved query is migrated deliberately. Do not rename/remove that event during rollout. Canonical result selection is suitable for funnels; never sum both events as two searches. The retained consented-name counter is an explicit compatibility exception, not a general approval to collect names.

Landing repository is present at `~/dev/ensdomains-landing`; its Next root layout loads Plausible, and `SearchInput` has a Plausible search marker. Keep Plausible for this rollout. Handoff: adopt the same opt-in cookie and shared production project only after deciding the landing measurement purpose; preserve ordinary links and safe campaign attribution. Do not put wallets/names into attribution URLs or introduce automatic cross-domain identity merging. No Landing edit was necessary for the two-app integration.

## Verification status

| Scenario | Automated | Browser / outgoing / ingestion |
| --- | --- | --- |
| Pending/denied consent; flags independent | Real SDK integration tests pass | Both homepages loaded locally; Manager pending banner and decline observed, banner disappears; denial persists on same-context navigation to Explorer. No `/i/v0/e/` ingestion resources observed. No real PostHog ingestion inspection. |
| Accepted/withdrawn/regranted | SDK and tracker tests pass | Acceptance observed against a temporary localhost collector using a fake staging token; native pageviews received. No real staging ingestion. Withdraw/regrant observed through the real navigation Settings switch: denial persisted across reload and suppressed view events; regrant emitted only current page/view/duration with a fresh observed flow, no start/completion. Pending-transaction/queued-beacon withdrawal still needs wallet QA. |
| Wallet A→B, disconnect, restored connection | Identity and provider tests pass | No funded test wallet interaction; manual acceptance required. |
| Old async outcomes / consent epochs | Tracker tests cover stale identities and regrant | No wallet/browser transaction verification. |
| Native pageview/pageleave and local gate | Config tests pass | Manager runtime config observed `history_change`, pageleave true, replay disabled, `before_send` suppressing local capture. Native pageviews received by the localhost collector after consent, including real SPA navigation; ordinary navigation/Settings clicks yielded no ordinary autocapture events; dynamic name/query values redacted. Native pageleave received by the loopback collector on full navigation; real PostHog ingestion remains unverified. |
| Product flow intermediate/final outcomes | Targeted machine/helper tests pass; regression mutation checks performed | Manager registration pricing screen observed on full reload: collector received flow_view then step_view(duration), one matching flow_id; no transaction completion was attempted. No renewal, migration or management transaction performed. |
| Desktop/mobile | No UI layout changes | Both homepages observed at 1280px and 390px; no horizontal overflow at mobile; Manager banner fits viewport. |
| Statistics unavailable | Worker regression reproduced before fix, then targeted tests pass | No live PostHog statistics query modified or production failure induced. |

Automated checks: both app `pnpm typecheck`, utils typecheck and API Worker typecheck. Manager affected workflow/wiring tests: 202 passed; final narrower rerun: 123 passed. Explorer final focused run: 71 passed; earlier helper run overlaps and is not additive. Final provider/config checks: Manager 20 and Explorer 17 passed; shared posthog tests 24 passed; Worker statistics tests 8 passed. These runs overlap some earlier checks and are not additive. Biome has only two existing complexity warnings (Manager bulk submit and Explorer search, both unchanged scores of 16). No full app test suite run. Local Cloudflare tests/dev servers required sandbox escalation for localhost/network-interface access. Restarting the Manager QA build initially hit a stale SSR React dependency-cache error; Vite --force restored the running screen. The first temporary collector proposal was rejected for its broad network binding; the executed fixture used loopback-only binding and restricted CORS.

## Manual acceptance, ordered by risk

Use staging builds only, two disposable connected-wallet accounts A/B, Sepolia funds/test tokens, and a registered test name you control. Open PostHog **staging** Live events, filter `environment=staging` and `source_app`; inspect each event's properties and identity. Use DevTools Preserve log for ingestion requests and page-leave beacons. Record browser observation, outgoing request, and ingested event independently.

1. **Environment/consent:** fresh storage → pending banner; search/navigate/click: no analytics. Decline → no analytics. Accept → only subsequent activity captured. Open the ENS navigation menu → Settings → Share usage data, and withdraw while a request is pending, then regrant: old operations must not resume capture or replay. Repeat across Manager/Explorer and a stale tab; verify feature flags still work. Normal local DEV and CI must send no events; staging key missing/equal to production must fail closed.
2. **Identity:** accept, connect A, reload, change network/connector, switch directly to B, disconnect, reconnect A. Events must use normalized connected wallet, never HCA/Safe executing account. Start a transaction as A, switch to B (and separately A→B→A) before resolving: old completion must be suppressed. No address property duplicates, signatures, errors, record values or calldata. Repeat Manager→Explorer navigation in the same browser context.
3. **Registration:** follow each app matrix's exact sequence through setup/commit/cooldown/approval/registration/verification. Check one `flow_id`, ordered `step_view`/`step_result`, and one `flow_complete` only after verified registration. Reject authorization at different stages; see failed step with retryability, no terminal flow failure. Retry and recover. Fail optional setup after registration: retain one registration completion; optional failure must not count as failed registration. Test EOA/HCA/Safe supported paths separately.
4. **Renewal/bulk:** duration/payment → start/execution → confirmed completion. Fail after a partial batch, inspect partial counts, retry; no double counting already completed items. Explorer completion means all required receipts, not approval alone. Reload/recover a pending operation and ensure no synthetic start or duplicate completion from an already finished transaction.
5. **Migration:** test direct and grace-renewal cases, mixed eligible/ineligible results and retry; inspect result counts and one observed completion. Explorer outgoing handoff must emit only `migration:manager_open`, not a migration completion.
6. **Management:** edit records, set primary name, create subname, change/link/unlink resolver, grant/revoke roles, DNS sync, notification preference save. Confirm relevant outcome only after success, none on rejection or failed receipt, none after switching identity midflight. No record values/destinations in payloads.
7. **Native events/privacy:** navigate routes containing test names/addresses and query strings; inspect native pageview/pageleave payloads (including previous-page fields and person initial properties). Only static route pattern survives. Ordinary clicks/forms produce no `$autocapture`; repeated clicks may produce native `$rageclick` with no DOM content. No replay, `$exception`, or arbitrary payloads. Do not infer a failure from abandonment.
8. **Network failures:** block analytics host and repeat UI actions. App remains usable. Unblock: pre-consent activity must not be replayed. Confirm capture resumes only for permitted current contexts. Inspect queued/beacon behavior during withdrawal explicitly.

Failure criterion: wrong identity/environment, an outcome on mere submission, repeated completion, raw sensitive payload, broken core UI when analytics fails, or pre-consent events. Capture evidence and fix before rollout. Expected per-app sequences and exact source functions are in the matrices.

## Dashboard recipes

Create in staging first; no remote dashboards were created here. Default filters: `environment=staging`, `analytics_version=1`; production dashboards must explicitly select production. Never treat Manager→Explorer as funnel stages.

- **Registration funnel:** `registration:flow_start` → `registration:step_view` (step=registration) → `registration:flow_complete`; hold `flow_id` constant and break down by `source_app`. Separate app-specific duration/payment/setup/approval stages instead of forcing identical funnels. Use step failure trends by step/method/chain/connector for friction.
- **Renewal:** start → execution view → complete, constant `flow_id`, breakdown `source_app` and `is_bulk`; inspect Manager failure `completed_count` alongside requested `item_count`. Do not sum partial counts across retries as new renewals.
- **Reliability:** `transaction:execution_end` by failure_stage/execution_method/chain_id/attempt_count. This is Manager failed-run diagnostics, not an all-app transaction failure rate or wallet rejection denominator. Separate step failures from terminal outcomes.
- **Adoption:** unique users on profile/subname/resolver/roles/DNS/notifications events, breakdown source_app. Use migration completion result counts separately from Explorer outgoing handoffs.
- **Measurement health:** counts by event/source/environment/version; alert on missing source_app or production events in staging. Compare starts to matured completion cohorts; recent starts are not failures.

Example HogQL for step friction (no joins):

```sql
SELECT properties.source_app AS app, properties.step AS step,
       countIf(properties.outcome = 'failure') AS failures,
       count() AS attempts
FROM events
WHERE event = 'registration:step_result'
  AND properties.environment = 'staging'
  AND timestamp > now() - INTERVAL 7 DAY
GROUP BY app, step
ORDER BY failures DESC
```

For migration outcomes, sum migrated/copied/ineligible separately after deduplicating `flow_id` within the observed run; UI receipts are not an authoritative lifetime ledger. For drop-off/time-to-complete, use PostHog funnels with a mature window and flow_id constant, rather than dividing unrelated totals.

## Remaining work / limits

Release gates: staging entitlement/token/proxy setup; actual wallet workflow and native unload/rageclick QA; staging ingestion inspection. There are no funded-account/mainnet transactions in this run. Correlation is lightweight and in memory: reload uses a fresh observed resume flow, not a durable universal journal. Suppressing an old-identity outcome is preferred to attaching it to another wallet; this intentionally undercounts such completions.

Not yet comprehensively instrumented: wallet request start/end and rejection classifications, successful global TM runs, Explorer renewal failure/retry/per-item partial results, DNS import/DNSSEC step journeys, transfers/fuses, HCA creation/adoption and notification interactions beyond Manager preferences, and dedicated Manager subname flows. Existing NFT/DNSSEC diagnostic events are retained but not renamed wholesale. These are explicit coverage gaps, not verified journeys. Source-map upload and sanitized exception tracking are deferred; raw exceptions stay off.

Regression check: checked app adapters/providers, Manager WalletLifecycle, all new flow/helper callers, API Worker stats route and Manager nameStats consumer. Existing tests changed only for intentional wallet normalization/minimization, explicit staging enablement, bounded TM telemetry, and unavailable-statistics behavior; registrationDisconnect changes its events mock to a partial import with unchanged assertions. No expectations were relaxed to hide a behavior regression.

Design notes: existing state machines and transaction hooks contain mixed IO/decision responsibilities. This change adds narrow analytics seams and reuses existing outcome predicates; it does not restructure pricing or transaction orchestration. A future flow architecture change should preserve verified required success, optional-setup separation, partial completion and retry semantics under existing tests.

References: [PostHog event best practices](https://posthog.com/docs/product-analytics/best-practices), [JavaScript configuration](https://posthog.com/docs/libraries/js/config). Current SDK behavior was checked against installed 1.404.1; research index and architecture informed scope, with the user's raw-wallet/opt-in decisions taking precedence.
