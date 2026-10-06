# BigName migration: behavior and remaining gaps

Updated 2026-10-06. This describes the current working tree of
`claude/bigname-rest-v041`, including uncommitted fixes. The apps target a
release combining BigName `main` and `next`, including the registry-child
identity work in [BigName PR 1094](https://github.com/ensdomains/bigname/pull/1094).
Deployment and required replay remain release prerequisites.

The initial comparison used apps main `cf0477881`; later correctness and
request-count checks used `2e1dade90`. Backend checks used main `4a89b2d21`
plus next `fbec2636a`, with the history review repeated at `53d11765a`.
Historical Sepolia v0.4.1 observations do not verify the combined release.

See the [client README](../packages/bigname/README.md) for API usage and release
capabilities, and the [request-count comparison](bigname-request-counts.md) for
HTTP costs.

## Open issues

| Area | Current limitation / next action |
| --- | --- |
| **Migration record copying — P1** | Indexed-null values remove known text/address keys before the fresh on-chain read. A record restored on-chain before BigName catches up can therefore be omitted during migration. Retain known keys and let the on-chain read decide whether values are empty. Confirmed by independent review; **not fixed**. See [v1ProfileKeys.ts](../apps/manager/src/features/migration/service/v1ProfileKeys.ts). |
| Resolver permission targets | Grants without an explicit numeric EAC target stay visible but read-only; they never default to resource 0. Whole-account removal also stops when any target or collection is incomplete. Genuine root grants can be affected. [TYR-253](https://linear.app/enslabs/issue/TYR-253) requests exact resource identity from BigName. |
| History action identity | Wrap/unwrap are generic authority changes. Operator approvals, reservations, resolver record links and token regeneration are excluded from product history. The v0→v1 handoff is diagnostics-only. Reverse claims need distinction from confirmed name writes; record resets omit their version. Contract lifecycle coverage also needs an explicit decision. BigName work: [TYR-255](https://linear.app/enslabs/issue/TYR-255). |
| History presentation | Portal currently calls every authority change “set registry owner” and every primary-name event “set primary name.” These labels overstate what generic authority changes and standalone reverse claims prove. Apps can distinguish the served authority kinds now; explicit wrap/unwrap wording needs backend support. |
| History detail | Event sender and original role bitmaps are missing: [TYR-254](https://linear.app/enslabs/issue/TYR-254). ENSv1 TTL changes are decoded but discarded; public-key changes are not admitted. Both are outside TYR-255. |
| Former resolver bindings | Nodes lists current bindings only; inactive/former bindings need [TYR-240](https://linear.app/enslabs/issue/TYR-240). The overview's node count remains a lower bound such as “200+.” |

ENSv1→ENSv2 migration history **is** supported. The old “unwrapped from ENSv2”
label was misleading UI wording, not a current contract operation to restore.
ERC-1155 quantity display is not a requested parity requirement.

## Changes users see

### Manager

| Area | Result after migration |
| --- | --- |
| Dashboard | One BigName inventory per connected/owner/smart-account address covers both eras and managed names. Rows merge by namehash. Ordinary registered children and unknown-label names are retained; reverse names are excluded. |
| Grace and renewal | A separate former-owner read restores released ENSv2 `.eth` names still in their 28-day grace. They remain former-owner rows rather than acquiring invented Owner/Manager roles. Subnames have no registrar grace. |
| Migration selection | Authority-filtered lists plus batched name/parent detail feed the existing classifier. Required failed, stale, missing or malformed lookup results error before classification. Unused speculative parent failures do not block an unwrapped candidate. |
| Migration eligibility | Missing registrar leases and explicitly missing reservations block direct `.eth` upgrades with an explanation. Copyable registry children are exempt from the individual-reservation requirement. Exact wrapper expiry comes from the API; there is no lease-derived fallback. |
| Migration profiles | BigName supplies the record inventory; existing RPC reads supply values. ABI inventory is used when served, otherwise types 1, 2, 4 and 8 are probed. Nonstandard ABI types without inventory are not copied. The indexed-null pruning bug above remains. |
| Address profiles and counts | One authority inventory replaces separate source lists. Unknown-label names can appear. Owned-registration counts include ENSv1 leases and exclude subnames; migrated counts require proven migrations. Unknown totals remain unknown. |
| Landing and search | ENSv1-only owners and held registered children can trigger the dashboard redirect. Search combines chain ownership with indexed status; unsupported names are conservatively treated as held. |
| Name dates | ENSv1 expiry and registration dates depend more on indexed data. Missing ENSv1 registration dates have no chain fallback; ENSv2 registration dates retain their chain fallback. |
| Primary-name picker | Still ENSv2-only and limited to the first 100 names, as on main. BigName's primary flag affects ordering; chain reverse resolution still supplies selection. |

Dashboard and migration share per-address authority queries. Migration does not
wait for unrelated accounts or grace requests, and failed eligibility does not
blank the dashboard.

### Portal

| Area | Result after migration |
| --- | --- |
| Address lists and suggestions | Authority, ETH resolution and ENSv2 grace inventories are merged. Resolve-only names remain visible. Suggestions include a subname of an owned name only when the address also holds or manages that child; there is no per-parent subname fan-out. |
| Profiles and records | Indexed inventories select records to read on-chain. `unresolvable_reason` produces an explanation instead of a misleading empty profile; a missing resolver does not always mean none is configured. |
| Subnames | Counts use API totals. Tables filter ownerless or invalid rows and retain valid labelhash placeholders, so displayed row counts can differ from totals. Proven registry children have normal detail/lookup rows in the target release. |
| Forward resolution | Membership covers all EVM coin types and the default EVM record. Batched detail supplies the Networks column; cleared records are excluded. |
| History | One cursor stream covers both eras with event timestamps, date filters and explicit migration rows. Record history spans prior resolvers. Costs, token/canonical IDs, referrer and transfer operator are displayed where served. Remaining omissions are listed above. |
| Child history | The full name timeline requests child registrations; faceted feeds do not. Registry `NewOwner` child creation is not included by that registration-event selector. |
| Other history feeds | Address and record history and recent activity omit rows without transactions; the full name timeline retains them. A primary-name action can still produce two similarly worded rows. |
| Resolver collections | Nodes, links and roles walk to completion. Unsupported counts show Unknown; partial counts show a lower bound. Nodes retain successful pages after transient continuation failure with a notice, but never retain an invalidated snapshot. |
| Registry detach check | Counts a complete fresh small page locally; larger registries use an additional exact filtered count. Unknown totals fail closed. |
| Roles | Name-role holders are reconstructed from complete permission history to preserve stored grants rather than read-time masks. Incomplete history errors. Root holders/history use BigName directly. Ordinary ENSv2 operators are supported; contract-derived/inherited authority can remain incomplete. |
| Post-write refresh | Polls publication status before invalidation, for up to about 60 seconds. Callers currently use the observed chain head rather than passing the receipt block, so completion time depends on indexing lag. |

Known-role bitmap decoding already excluded unmapped powers on main; it is not
a new role-count regression. Unknown numeric permission targets are a separate
issue from descriptive record metadata.

### Worker

The faucet scans ENSv1/v0 names until an eligible name or the final page, with no
app page cap. It excludes reverse, released and unregistered rows and expired
leases. Read failures remain errors rather than negative eligibility.

The worker runs only after the ENSv2 cutover. Expiry reminders use three tracks:

| Track | Date used for notices | Query offset / grace |
| --- | --- | --- |
| ENSv2 `.eth` | Registration expiry | No offset; 28-day grace |
| ENSv1 `.eth`, reservation served | ENSv1 lease expiry | Reservation is lease +62 days +1 second; 90-day lease grace |
| Subnames | Served entry expiry, including wrapped subnames | No registrar grace |

The seven `.eth` stages are 30/7/1 days before expiry, grace start, 7/1 days
before grace ends, and premium start. Subnames receive 30/7/1-day and expired
notices, without Renew/Register actions.

Premigration finishes before cutover, and renewals extend the lease and
reservation equally. The reservation's exclusive release deadline is one second
after the lease's inclusive 90-day grace deadline. Pre-cutover lease sweeps are
not supported.

Windows use the earlier of wall time and publication time. Reads batch open
windows per track, with independent stage checkpoints. Failed track reads hold
that track's checkpoints; queue failures remain isolated per stage. Recipients
use the current or lapsed owner, and notification idempotency keys are unchanged.

There is no separate reminder track for an independent wrapper deadline on a
`.eth` 2LD. Expired ownerless wrapped subnames can notify favourites only.
Max-value expiries and dates outside the supported track offsets are skipped;
overflow is reported.

## Collection limits and completeness

| Collection | Guard / behavior |
| --- | --- |
| Address-name inventories and forward-resolution names | 10,000 rows per walk. Manager dashboard/profile/migration error on truncation; Portal lists retain the bounded result. |
| Full Portal record history, address history and its ownership lookup; resolver nodes/links/roles | No app row or page cap. Requests are cancellable; short previews remain bounded. |
| Name-role history | 2,000 rows, oldest first; incomplete walks error rather than produce current holders. |
| Resolver overview | First 200 nodes and events. Nodes count is a lower bound; the dedicated Nodes page continues paging. |
| Registry labels / subregistry-slot history | First 100 labels / 50 history rows. An incomplete slot read cannot prove absence. |
| Name-history total | Backend exact-count guard is 10,000 events; larger totals can be unknown. |
| Faucet | No app page cap; false requires completion. |
| Expiry discovery | 1,000 rows per stage window; exact-second recovery up to 5,000 rows, with overflow reporting. |

Role-summary budget errors retry the same cursor at smaller sizes before
falling back to one row without roles. Earlier complete pages retain their
summaries. Empty permissions are not proof of complete coverage; honor metadata.

## Validation and release checks

After the app fixes, the full suites passed: Manager **2,843** (1 skipped),
Portal **2,338**, Worker **274** (31 skipped). All three typechecks passed.
Biome checked 96 changed TypeScript files with no errors and three existing
complexity-threshold warnings. No code changed during this documentation edit.

The independent review later found the migration record-key issue above with a
focused reproduction; passing suites did not cover it. It reviewed major paths
across the final working tree, not every changed line.

Before release, verify the combined backend capabilities and replay, actual
resolver permission coverage, grace/released-name behavior, exact counts on
large wallets, and migration record preservation. Browser E2E and live
verification of that combined deployment have not been completed. The E2E mock
intercepts browser requests only; SSR and manual snapshot environments can
still read public Sepolia data that does not contain locally registered names.
