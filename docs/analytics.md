# ENS analytics handoff — WEB-1251

Analytics is optional, opt-in and best effort. Product requests, rendering, signing and transaction handling must not await analytics or fail because the SDK throws. Critical events belong to the operation that observes the fact; React observes only optional visible-screen metrics.

## Developer API

Define an event once in `packages/utils/src/posthog/eventContracts.ts`, then call the app's typed `track()` at its actual trigger. There is no second property allowlist, runtime schema framework, analytics backend or event journal.

```ts
track('name_search:result_select', {
  source: 'header_search',
  result_type: 'name',
  name_length: name.length,
})
```

Before asynchronous work, bind the initiating consent/wallet identity:

```ts
const analytics = startAnalyticsOperation()
await updatePrimaryName()
analytics.capture('profile:primary_name_update', { chain_id: chainId })
```

The guard suppresses old outcomes after wallet/consent changes, including A→B→A and withdrawal/regrant. Never wait for capture or make product success depend on it. A capture attempt is not an ingestion acknowledgement. Correlation IDs are optional infrastructure: unavailable crypto suppresses telemetry while product work continues.

`createAnalyticsTracker` binds the existing SDK and wallet reader. SDK configuration alone owns environment policy, metadata and automatic-data scrubbing, including top-level person properties and flag-request attribution. There is no PostHog React provider/type-cast bridge; guarded SDK flag subscriptions keep optional SDK failures out of React rendering.

## Lifecycle and outcome ownership

- **Explorer renewal:** each real submission attaches receipt observation. Successful receipts produce transaction confirmations and final completion, independent of Done or unmount. Hard manager cleanup retains read-only observation when a hash or bundle ID is known; cleanup itself is not an execution failure. Done controls only existing UI callbacks. Atomic and separate approval paths count their actual required transactions; failures retain partial progress and retries do not double-count receipts.
- **Explorer registration:** subscriptions attach synchronously before START/RESUME. A queued reveal attaches observation before UI publication, using verification inputs pinned before submission. Known hashes/bundle IDs remain observable after hard cleanup through the existing shared receipt actor, including Safe/EIP-5792 handling. Without a known submission identifier, bounded read-only ownership verification may recover completion. Neither path signs, submits or resumes paid work; confirmed success and verified recovery share deduplication.
- **Manager renewal:** EOA submission attaches independent receipt observation before the UI actor's onDone; filled HCA service results also capture completion before UI publication. Existing cancellation/payment consent behavior remains.
- **Manager bulk renewal:** initiating analytics and selected/completed items are retained by the actual row outcomes. The last required confirmation reports completion before UI staleness checks or the progress animation. Partial work never reports full completion; existing paid execution and cancellation behavior remain unchanged.
- **Manager migration:** confirmed service results are observed before the UI cancellation guard, using the existing merged operation counts. Empty abandoned outcomes do not become completions; optional analytics errors cannot replace the service's result.
- **Manager profile records:** the actual record/update-resolver mutations bind identity before the write and capture after completion. Dialog success messages only update the UI; stopping the dialog cannot discard the outcome.
- **Manager registration:** the shared submit result attaches receipt observation before publishing the registration transaction ID to the UI, with bounded read-only verification fallback. No paid workflow is detached or continued on navigation.
- **Visible pricing screens:** a small framework hook subscribes to current idle UI, with a pure comparison function. Dedicated screen events are best effort and are not mandatory business funnel steps. Mounting/unmounting may omit a screen that was never meaningfully observed; it must not determine operation success.

Registration cancellation still pauses/stops the existing protocol workflow. Read-only result observation does not change that behavior. No completion is fabricated from an unsubmitted wallet prompt, an unverified read, a failed lookup, a UI success screen, or movement to the next stage.

Ownership-verification fallback uses the existing 30-second grace plus RPC durations; known submitted Explorer transactions use the existing receipt timeout instead. Hard cleanup before any hash/bundle ID, late confirmations after those observation windows, a closed browser, or blocked ingestion can remain unobserved. No exactly-once delivery or cross-reload analytics journal is promised. Registration receipt observations follow actual transaction actors, since IDs can be reused; final completion deduplicates by the observed flow.

## Event registry

All outgoing events receive `source_app: manager | explorer`, `environment: production | staging`, and `analytics_version: 1` at the SDK boundary. Execution events include known chain/method context; raw connected wallets are identity, not duplicated properties. `stage_enter` means entry into execution, not a viewed screen or confirmation.

| Events | Properties / trigger | Apps |
| --- | --- | --- |
| `registration:flow_view`, `duration_view`, `payment_view` | `flow_id`; currently observed idle screen | Manager |
| `registration:flow_start`, `flow_resume`, `flow_retry` | `flow_id`, known `chain_id`, `execution_method`; explicit operation intent/recovery | Both |
| `registration:stage_enter` | Above plus controlled `stage`: setup/approval/commit/cooldown/registration/verification; Manager also execution/post_registration | Both |
| `registration:stage_fail` | Stage plus `is_retryable`, known bounded `error_code` only; never guessed from every error | Both |
| `registration:payment_option_select` | `flow_id`, `payment_asset`, optional `funding_chain_id`; user choice, excluding automatic fallback selection | Manager |
| `registration:flow_complete` | Required registration confirmed or verified; optional post-registration setup remains separate | Both |
| `renewal:flow_view`, `duration_view`, `payment_view` | `flow_id`; optional observed idle pricing screen | Manager |
| `renewal:flow_start`, `flow_retry`, `stage_enter`, `stage_fail` | `flow_id`, known chain/method; stage approval/execution/verification; bulk failure `completed_count` where known | Both; app stages differ |
| `renewal:transaction_confirm` | `flow_id`, `chain_id`, stage approval/execution; one successful receipt, not a renewed-name count | Explorer |
| `renewal:flow_complete` | `flow_id`, `item_count`; all required renewal work confirmed, once per run | Both |
| `renewal:payment_option_select` | Same deliberate payment properties as registration | Manager |
| `migration:flow_view`, `flow_start`, `flow_retry`, `stage_enter`, `stage_fail`, `flow_complete` | `flow_id`; stage renewal/execution; completion actual `item_count`, `migrated_count`, `copied_count`, `ineligible_count` | Manager |
| `migration:manager_open` | `is_wrapped`; outgoing handoff, not migration completion | Explorer |
| `name_search:result_select` | `source`, required name/address/resolver `result_type`, optional `is_available`, `name_length`; explicit selection | Both |
| `profile:records_update`, `profile:primary_name_update` | Confirmed write, `chain_id`, optional record count; no record values or manufactured operation UUID | Both |
| `subname:name_create`, `resolver:configuration_update`, `roles:permissions_update`, `dns:manager_sync` | Receipt-backed operation; chain and bounded action where applicable | Explorer |
| `notifications:preferences_update` | Successful preferences response; no destinations/preferences payload | Manager |
| `transaction:execution_end` | Bounded failed TM run: opaque operation ID, failure/cancel outcome, stage, known method/chain, attempt count | Manager |
| `$pageview`, `$pageleave`, `$rageclick` | Native SDK events; sanitized URLs and automatic properties | Both |

Retained legacy events: `name:search_selected` carries normalized name solely for existing search-popularity statistics. Do not rename/drop its field until the saved endpoint is migrated. Existing NFT/Intercom/DNSSEC categories remain. DNSSEC includes controlled source/verdict, no raw names or name-bearing failed-step strings. Never sum canonical search selection and its legacy counterpart as two searches.

Custom contracts are the privacy boundary for deliberate properties: never pass raw errors, signatures, calldata, arbitrary URLs or state/request objects. Automatic URL/DOM/campaign data is minimized in configuration. The installed bundled SDK import remains unchanged for CSP. Ordinary autocapture is discarded while masked native rageclick detection retains its click listener. Replay, raw exception and dead-click capture remain disabled.

## SDK failure isolation

Consent reads in rendering return unavailable on SDK failure. Optional backend analytics headers return empty without affecting Authorization or the request. Disconnect resets, feedback calls and SDK loaded callbacks are guarded. Guarded feature-flag readers preserve the existing false/undefined defaults when SDK reads or subscriptions fail. Feature flags do not require analytics opt-in.

Synchronous capture exceptions and rejected capture promises are contained. A pending analytics request is never awaited by product work. A synchronous infinite loop in a third-party main-thread SDK cannot be interrupted by try/catch, a Result, or a promise timeout; this implementation does not claim worker-level isolation.

## Configuration / remote setup

| Deployment | Settings |
| --- | --- |
| Production, both apps | `VITE_PUBLIC_ANALYTICS_ENV=production`; same `VITE_PUBLIC_POSTHOG_KEY` |
| Staging, both apps | `VITE_PUBLIC_ANALYTICS_ENV=staging`; explicit `VITE_PUBLIC_POSTHOG_STAGING_KEY`, distinct from production |
| Normal local/CI | Analytics environment unset; remote capture disabled, flags may initialize |
| Deliberate local staging QA | Staging settings plus `VITE_PUBLIC_ANALYTICS_DEBUG=true` |

Use the appropriate `VITE_PUBLIC_POSTHOG_HOST` proxy/host. Staging never falls back to production. Do not expose personal API keys in Vite variables. See `.env.example` and [configuration details](analytics-configuration.md).

Read-only inspection on 2026-11-06 found ENS App combined production project 109100 and an organization project limit of one. An owner must resolve entitlement and create/configure staging; no project, billing, production setting or dashboard was changed. Mirror essential flags deliberately and verify CSP connectivity before enabling staging. Landing still uses Plausible; no forced integration was added. Its handoff is shared opt-in/project policy after a separate measurement-purpose decision, without wallet/name attribution URLs.

No active source-map upload setup was found in the earlier inspection. Raw exception capture remains off; source-map upload and sanitized exception tracking remain separate follow-ups.

## Verification and manual QA

Automated coverage targets failure boundaries and real lifecycle seams, not every event call. New regressions were observed failing before fixes or against deliberately broken code: successful renewal without Done, owner unmount while receipt pending, registration submitted reveal verified after unmount, no false grouped-stage success, backend headers/rendering with throwing SDK, and SDK initialization/reset/feedback failures. Metadata assertions cover real SDK configuration as well as pure preparation.

After pruning, the affected checks pass: Manager 177 tests in eight files, Explorer 35 in four, and shared analytics 26 in five. `pnpm typecheck` passes in both apps, transaction-manager and utils; Biome passes on the changed tests. Production code is unchanged by this pruning pass. The earlier broader transaction-manager checks and browser evidence below still apply. The app matrices document exact triggers and expected manual sequences; the shared event map defines the types.

Test pruning removed 589 lines overall, reducing feature-added test lines from 3,107 to 2,521. Pre-feature cases and assertions remain. Small file-local builders and tables replace repeated wallet/submission setup; new duplicate checks are covered at their owning layer:

- Full SDK envelope, flags, metadata and cross-tab consent checks live in the Manager SDK integration tests; Explorer retains its own configuration wiring and pre-feature consent tests.
- Shared tracking retains wallet/identity and throw/reject boundaries; bounded diagnostics use the existing Manager provider test rather than a duplicate forwarding test.
- One flow-view hook wiring scenario replaces repeated React lifecycle variants. Critical outcomes remain covered outside React.
- Actual Explorer hook cleanup/resume tests replace a duplicate manually stopped registration observer and a duplicate no-Done receipt test. One unverified control covers the repeated negative permutations.
- Manager registration receipt/verification routes share a table; replacement/rebind behavior shares one scenario. Optional setup and migration retries extend existing machine tests, with their prior assertions retained.
- Renewal partial progress, pending deduplication and retry now share one real-actor scenario. Known hash/bundle outcomes, late confirmation and reused-ID isolation remain separate regressions.

Representative mutation checks still fail for false failed-receipt completion, lost replacement actors, fabricated unverified registration, missing consent revisions, duplicate flow entries and unhandled SDK rejection. The rejection check uses a raw SDK callback because `vi.fn` can handle a rejected mock result and hide the missing production rejection handler.

Real-SDK regressions cover complete identify/pageview envelopes, native `title`, initial/refreshed flag bodies with old stored attribution, and legacy/current consent invalidation across independent module instances. Outcome regressions cover bulk unmount, early registration stop followed by failed receipt/verified recovery, migration renewal/preparation retries, hard-cleanup success/revert, EIP-5792 bundle success/failure, and replacement actors sharing an ID while prior recovery is pending. New bug cases were observed failing before fixes or against deliberately broken code.

Browser SDK fixture QA used a fake key and localhost collector: accepted the actual banner, identified a synthetic wallet in an isolated SDK instance, seeded legacy attribution, reloaded flags and captured a sensitive-title pageview. The checked identify envelope, latest pageview and three flag requests contained no test ENS name, query secret, fragment, campaign or ad identifier; URL was `/register/:value`, title absent, metadata `manager/staging`. This is browser/outgoing-payload evidence, not a real wallet workflow or staging ingestion. Initial pre-fix title evidence was excluded from the final payload check.

| Scenario | Evidence in this pass | Still required |
| --- | --- | --- |
| Manager duration flow, native pageview/pageleave, redacted dynamic route, common metadata | Browser interaction; outgoing events received by a local fake-key collector | Real staging ingestion; no production QA traffic was sent |
| Held analytics requests | Collector deliberately never answered ingestion; navigation, duration change and consent withdrawal/regrant remained responsive | Real transaction under blocked analytics |
| Local environment isolation | Explorer rendered at desktop/mobile widths; configuration disabled capture and discarded a candidate native event | Deployment keys, CSP and staging ingestion |
| Unmount during registration/renewal, no Done, retries and resumed verification | Real actor/hook lifecycle regression tests with controlled transaction/verification results | Disposable-wallet testnet execution and reload recovery |
| SDK throws/rejects, consent and identity changes | Focused failure-boundary and identity tests | Real wallet A→B→A, connectors/networks, cross-app identity |

Both apps rendered at 1280px and 390px. Explorer's activity table overflowed at mobile width; this pass changes no layout. Hot reload, consent regrant and unacknowledged SDK retries occurred during fixture QA, so its event totals are not a deduplication measurement. No wallet signing, paid operation or real PostHog ingestion was browser-verified.

Manual acceptance, on staging/testnet with disposable wallets A/B:

1. Start renewal, submit, then close the modal/navigate away before its receipt. Expect `flow_start`, relevant `stage_enter`, actual `transaction_confirm` in Explorer and exactly one `flow_complete`. Do not click Done. Reject/fail a later batch stage: no premature completion; retry retains confirmed progress.
2. Submit a registration reveal, leave the screen, and inspect confirmed/read-only verified completion. Unsubmitted prompts and unverified reads must not complete. Optional setup failure must not reverse required registration success. Check actual paused/resumed registration paths separately.
3. Switch A→B and A→B→A while pending, withdraw/regrant consent, and reload a restored connection. Old contexts must never attach to another wallet or replay pre-consent activity. Suppressed old-identity completions intentionally undercount rather than misattribute.
4. Block analytics, and exercise navigation, backend requests and supported transactions. Product work continues. Inspect app and environment metadata on outgoing requests and actual staging ingestion independently.
5. Verify native pageview/pageleave and URL redaction with test names/addresses/query strings; ordinary clicks/forms emit no `$autocapture`, no raw exceptions/replay/payload objects. Confirm default local/CI capture remains disabled.
6. Save profile records and perform a reviewed resolver setup, then navigate away while the final transaction is pending. Expect one `profile:records_update(chain_id=...)` after the actual write completes, independent of the dialog. Rejected/failed writes emit no success. Repeat a primary-name update; verify the reverse record and its dedicated event.
7. While Explorer renewal is pending, start another flow that clears the manager. A known submitted transaction must still confirm/complete; cleanup alone must not emit failure. Repeat with EIP-5792 and Safe. For registration, leave a known reveal pending for over 30 seconds after cleanup; its receipt must remain observable within the normal receipt timeout. Hard cleanup before any hash/bundle ID is an unobserved outcome, not proof of failure.
8. On Manager, navigate off the dashboard during the last bulk-renewal receipt or progress animation: full confirmed selection completes once, partial selection does not. Fail grace renewal during migration and retry; expect `migration:stage_fail(stage=renewal)`, `flow_retry`, and another renewal stage. Retry a preparation error too; do not mislabel it as failed grace renewal.
9. With two consenting tabs/apps, start an operation in one, withdraw and regrant in the other before the five-second poll. Old completion stays suppressed. Also test an already granted browser with no generation metadata, which must continue working without another banner or consent prerequisite. Inspect flag requests and top-level person properties as well as ordinary event properties.

Browser/ingestion evidence must distinguish actual browser observation, outgoing local fixture event, and real PostHog staging ingestion. Automated actor tests do not establish real-wallet or real-chain QA.

## Review notes

The SDK adapter remains one injected binding for consent, wallet safety and exception containment. Callers use `track` directly; asynchronous writes bind `startAnalyticsOperation` once. No capture result is needed by product logic. Local weak references prevent duplicate observed outcomes without persisting another lifecycle. Registration's optional runtime queue callback carries pinned read-only verification inputs; one pure shared builder avoids app-specific copies. Receipt recovery reuses the actual transaction-manager receipt function, preserving Safe and batch semantics. Migration merge decisions live in the domain service, and renewal receipt results are keyed by the domain submission rather than analytics identity.

Existing assertion changes reflect the intentional event rename (`step_view`/`step_result` to truthful stage/screen events), added chain/method metadata, guarded flag-hook imports, and framework provider setup. Same-actor dedup tests now assert one actual subscription instead of pinning lookup counts. Product assertions remain intact. Catching untyped SDK exceptions is deliberate at the optional IO boundary; it does not replace typed transaction failures or unwrap Results by throwing. No style-guide change is proposed.

## Dashboard recipes

Use explicit environment/version filters and break down comparable outcomes by source_app. Manager and Explorer are alternatives, not consecutive funnel stages.

- Registration: `flow_start` → `stage_enter(stage=registration)` → `flow_complete`, correlated by flow_id. Screen views are optional acquisition/UX observations, not completion prerequisites. Analyze known stage failures separately; stage entry is never step success.
- Renewal: `flow_start` → execution stage → `flow_complete`; inspect confirmed progress and final item_count. Transaction confirmations include approval and must not be counted as renewed names.
- Migration: actual migrated/copied/ineligible counts, distinct from Explorer handoff adoption. Do not count accumulated retry progress as new migrated items twice.
- Reliability/adoption: bounded transaction failures by stage/chain/method, dedicated management outcomes by app; check missing source/environment metadata. Recent starts, paused operations and unobserved outcomes are not automatically failures.

In PostHog Funnels, use ordered events, hold `flow_id` constant and break down by `source_app`. Make approval/setup branches optional rather than requiring steps absent from another execution method. Use a realistic conversion window for commit/reveal; filter `environment` and `analytics_version` on every insight. A quick measurement-health query is:

```sql
SELECT properties.source_app AS app, event,
       count() AS event_count,
       uniqExact(properties.flow_id) AS observed_flows
FROM events
WHERE properties.environment = 'staging'
  AND properties.analytics_version = 1
  AND timestamp >= now() - INTERVAL 7 DAY
  AND event IN ('registration:flow_start', 'registration:flow_complete',
                'renewal:flow_start', 'renewal:flow_complete')
GROUP BY app, event
ORDER BY app, event
```

These are event/observed-flow counts, not a conversion rate: starts and completions may cross the reporting window or reload correlation segments. This query has not been run against a staging project.

## Limits and design notes

Browser-only telemetry cannot guarantee ingestion after tab/process shutdown, lost networking or consent withdrawal. Read-only registration confirmation is bounded. Submission-result callbacks close the UI-publication window; they do not continue paid work or make ingestion durable. Durable cross-reload correlation/backfill and authoritative server/indexer outcome accounting are intentionally not introduced here.

Registration UI/protocol/global transaction ownership already spans actors and callbacks. This change observes confirmed facts without continuing paid orchestration on navigation. Deduplication is local to the operation/run, not an external journal. Registration and pending renewal observations distinguish actual actors when transaction IDs are reused; superseded renewal callbacks cannot overwrite their replacement. Imperative refs/listener registration and weak dedup caches are IO adapter state; business selection/count/transition decisions remain plain functions. A broader lifecycle consolidation should use the existing transaction seams rather than growing another event journal. No unrelated style-guide rewrite is included.

Intended analytics contract changes: dedicated duration/payment views; execution stage_enter/stage_fail replace ambiguous step_view/step_result; no inferred stage successes; method/chain metadata consistent on Manager registration/renewal stages. Existing tests retain product assertions while event expectations change to the deliberate schema. Test harnesses supply real required Wagmi context or retain real exports in existing framework mocks; no behavior assertion was relaxed. The old renewal callback-only test is replaced with real transaction-actor receipt/unmount regressions.
