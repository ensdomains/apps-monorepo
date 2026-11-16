# Analytics

Shared PostHog instrumentation for Manager and Explorer. Start with [QA](qa.md) before shipping; deployment keys, consent and source maps are in [configuration](configuration.md). [Remaining work](remaining-work.md) lists actual gaps and the revenue handoff.

## Adding an event

Names and payloads live in [`eventContracts.ts`](../../../packages/utils/src/posthog/eventContracts.ts), with trigger descriptions and autocomplete. Use the app's `track` for explicit actions. Before asynchronous work, bind `startAnalyticsOperation()` and capture through it afterward. The bound capture requires consent at start and send, and the initiating wallet/identity at send; intermediate changes are not journaled. Never await analytics or use its result to decide product behavior.

```ts
const operation = startAnalyticsOperation()
const nameProperties = getAnalyticsNameProperties(name)
const result = await saveRecords(params)
if (result.isErr()) return result
operation.capture('profile:records_update', {
  ...nameProperties,
  chain_id: chainId,
})
return result
```

`getAnalyticsNameProperties` safely normalizes a validated operation name; invalid/absent input is omitted. Pin it before awaiting. `ens_name` describes the operation, wallet `distinct_id` describes the consenting user, and `flow_id` describes the observed journey. Never register a current name globally or as a person property. Bulk operations retain counts rather than name arrays. Address/resolver searches and resolver-wide permissions have no guessed name. The legacy search event retains its existing `name` field for the popularity API.

Keep record values, signatures, calldata, credentials and raw request/error objects out of custom events. Native URLs, titles and marketing attribution remain useful and enabled. A normalized name is intentionally included on single-name journeys/outcomes after consent; it is not an ownership claim.

## Event guide

Every outgoing event receives `source_app=manager|explorer`, `environment=production|staging` and `analytics_version=1`. Known execution chain/method are included where available. The typed registry is authoritative for exact required/optional fields.

| Events | Meaning / important properties | Apps |
| --- | --- | --- |
| `registration:flow_view`, `duration_view`, `payment_view` | Current entry/controls observed; `flow_id`, `ens_name`. Explorer payment appears only with its connected picker | Both |
| `registration:flow_start`, `flow_resume`, `flow_retry` | Accepted operation, restored segment or retry; `flow_id`, `ens_name`, known `chain_id`, `execution_method` | Both |
| `registration:stage_enter`, `stage_fail` | Major execution milestone; controlled `stage`, failure `is_retryable` and known bounded `error_code` | Both |
| `registration:payment_option_select` | Deliberate asset/funding-chain selection; automatic fallback excluded | Manager |
| `registration:flow_complete` | Required registration receipt/verification succeeds; optional setup remains separate | Both |
| `renewal:flow_view`, `duration_view`, `payment_view` | Current pricing/modal surface observed | Both; Manager single-name entry only |
| `renewal:flow_start`, `flow_retry`, `stage_enter`, `stage_fail` | Actual execution; `protocol_version=v1|v2|mixed`; known bulk `completed_count` on failure | Both |
| `renewal:transaction_confirm` | One required transaction receipt, `stage=approval|execution`; approval is not a renewed name | Explorer |
| `renewal:flow_complete` | All selected work confirmed; `item_count`, bulk `v1_item_count`/`v2_item_count` | Both |
| `renewal:payment_option_select` | Deliberate payment selection | Manager |
| `migration:flow_view`, `flow_start`, `flow_retry`, `stage_enter`, `stage_fail`, `flow_complete` | Migration execution; `flow_id`, stages renewal/execution; actual migrated/copied/ineligible counts | Manager |
| `migration:manager_open` | Outgoing upgrade link, not migration success | Explorer |
| `profile:edit_view`, `edit_start` | Available editor observed, then first actual change; `flow_id`, `ens_name` | Both |
| `profile:save_start`, `save_fail`, `save_complete` | Accepted save, attempt failure, or successful publications/writes; `chain_id`, failure `stage`, completion `save_type=records|image|records_and_image` | Both; Explorer records only |
| `profile:records_update`, `profile:primary_name_update` | Confirmed on-chain record/reverse-name write; `ens_name`, `chain_id`, optional record count/edit `flow_id` | Both |
| `subname:name_create`, `resolver:configuration_update`, `roles:permissions_update`, `dns:manager_sync` | Confirmed advanced operation; chain, applicable `ens_name`, controlled `action` | Explorer |
| `name_search:result_select` | Explicit destination selection; controlled source/type, applicable `ens_name`, availability/length | Both |
| `name:search_selected` | Existing normalized `name` required by Worker popularity statistics; same action as canonical selection | Manager |
| `wallet:connect`, `wallet:disconnect` | Connected identity lifecycle; chain/connector on connect | Both |
| `transaction:execution_end` | Failed/cancelled TM attempt; opaque ID, stage, method, chain, attempt count; no raw transaction context | Manager |
| `notifications:preferences_update` | Successfully saved API preference change; no contact data | Manager |
| `nft:completion_check`, `claim_outcome`, `renderer_fallback`, `download_failure` | Controlled NFT diagnostic outcomes/reasons; async results bind initiating consent/identity | Manager |
| `dnssec_debug:opened`, `result` | Controlled source/verdict; no raw proof or diagnostic payload | Explorer |
| `intercom:booted` | Successful consent-gated reciprocal support linkage | Both |
| `$pageview`, `$pageleave`, `$rageclick`, `$exception` | Native SDK observations/errors; replay and ordinary click/form capture stay off | Both |

## Source locations

| Journey | Manager | Explorer |
| --- | --- | --- |
| Registration | `features/register-v2/state/registrationUi.machine.ts` | `features/register/hooks/useRegistrationTransactions.ts`, `utils/registrationAnalytics.ts` |
| Renewal | `features/renew/state/renewalUi.machine.ts`, `features/bulk-renew/hooks/useBulkRenewSubmit.ts` | `features/renew/hooks/useRenewalTransactions.ts`, `utils/renewalAnalytics.ts` |
| Profile editing | `features/profile/components/dialogs/edit-profile/`: machine, view hook, save mutations | `routes/$name/edit-records.tsx`, `features/records/helpers/saveRecords.ts` |
| Migration / NFT | `features/migration/state/migrationUi.machine.ts`, `commemorative-nft/` | `features/migration/components/UpgradeActions.tsx` (handoff only) |

Paths are relative to each app's `src/`. Shared contracts, consent, identity, name normalization and small flow-specific helpers live in `packages/utils/src/posthog/`; SDK bindings stay in each app's `lib/posthog/`. Simple advanced outcomes sit beside their write helpers.

## Business work and analytics observation

- Profile save: existing services publish images or submit records and await their result. Added instrumentation records edit/save intent and reports completion inside the mutation/helper after that work succeeds, before screen callbacks. Records emit `records_update`; image-only publication does not. Closing an editor does not cancel an already-running save or make its completion depend on a mounted screen.
- Renewal: existing machines/transaction-manager submit approvals and renewals and observe receipts. Added instrumentation reports the relevant stages and renewal receipts, excluding approval receipts from completion. Explorer retains bounded read-only receipt observation when closing its modal stops the transaction actor. Manager's submitted work likewise reports outcomes outside a Done click. Neither observer signs or resubmits a transaction. A receipt timeout alone does not establish a failed renewal; Manager's current failure reporting still needs that distinction corrected.
- Detached Manager registration: the existing submission callback attaches completion observation before the UI can disappear. A successful transaction or pinned on-chain verification reports completion through the flow's existing once guard. If receipt observation ends with an unknown outcome, the existing bounded verifier can run after UI teardown, even when the transaction actor is still live. Definite failures skip that extra check; an ambiguous submission error may still need it. This can duplicate a bounded read-only check while the UI verifier is also alive; completion stays once per flow. Closing the browser ends in-memory observation.

## Funnels and dashboards

- Registration/renewal conversion: `flow_view → payment_view → flow_start → flow_complete`, holding `flow_id` constant; break down by app, execution method and renewal protocol. Duration often co-fires with entry, so it is not another conversion hurdle. Explorer registration controls can share a page.
- Explorer registration keeps entry/duration observations when an anonymous visitor connects a wallet; only a newly visible payment picker is reported. An actual wallet replacement or a new flow receives fresh observations.
- Execution friction: inspect applicable `stage_enter → stage_fail` and subsequent retry/completion. Registration stages include setup, approval, commit, cooldown, registration and verification; Manager additionally has coarse execution and optional post-registration setup. A failed step is not terminal abandonment. Commit/reveal needs an appropriate conversion window.
- Explorer registration: Start after a rejected run emits another `flow_start` under the current page's flow ID; continuing the existing failed run emits `flow_retry`. Count distinct flow IDs for conversion, not raw start events. Reload resume uses `flow_resume` in a new observed segment.
- Profile conversion: `edit_view → edit_start → save_start → save_complete`. Review-modal abandonment falls before accepted save. Image-only completion is not a record write. Use `records_update` for on-chain adoption; never add it to editor completions as another save.
- Renewal counts: version counts describe the selection; final `item_count` describes a completed batch. Do not treat approval receipts or partial progress as full completion.
- Migration: compare start/retry to completion, keeping migrated/copied/ineligible counts separate. Explorer's handoff click is not a migration completion.
- Health: filter production/staging explicitly; inspect missing protocol/name/flow context where expected, duplicate completions and sudden drops by release/app. Search's canonical and legacy events represent one action.

Views are best effort; services/actors own outcomes independently of Done/unmount. Reload recovery starts a new observed segment, not a manufactured start for historical work. No work started without consent is replayed after grant; withdrawal blocks sending while denied, and regrant may permit an already-consented pending result. A closed browser, expired verification window or blocked ingestion can omit outcomes; these events are not complete on-chain accounting. Native initial pageview readiness is coordinated with identity synchronization; no manual replacement pageview is fabricated.
