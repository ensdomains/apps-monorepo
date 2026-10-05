# What changes on screen and in data when the ENS apps move to bigname

Date: 2026-10-05.

- **Apps branch:** `claude/bigname-rest-v041` at `f375c25ca`, based on `origin/main` `cf0477881`. Commits, oldest first:
  - `18dcb15df` the REST migration (squash)
  - `28de4810c` client, `0386ca012` manager and migration, `c27009609` portal, `721080dc3` api-worker, `727714552` e2e mock: the moves to bigname v0.4.1
  - `ae0f8042e` subname expiry notifications
  - `99336217d` Networks column lists every address-record coin type
  - `024376ea1` resolve-only names restored under "Names assigned"
  - `d26b79026` migration wording, derived ENSv1 token ids, primary-name pill
  - `b2758218a` owned-subname search fan-out dropped
  - `a3f750d5a` client types for the shapes merged after v0.4.1
  - `a19edbb2b` registry root roles read from bigname where served
  - `cf8f7781b` history fields served after v0.4.1
  - `f375c25ca` served wrapper expiry and nullable address-name counts
- **bigname deployed:** v0.4.1 (`4e172eb47`) at `https://sepolia.api.bigname.sh`. `/openapi.json` reported that build on 2026-10-05.
- **bigname pending:** `main` at `4a89b2d21` (twelve commits after v0.4.1, not deployed) and `next` at `9c33e4e68` (the next hash-rotating release).
- **Before:** `origin/main` of this repo, which reads the ENSv1 subgraph (ENSNode) and the Panoptes GraphQL indexer.

Audience: reviewers of the bigname REST switch and the apps team. Scope: every difference a user can see on a screen, or a consumer can see in data, between `origin/main` and this branch. Transport and client design are in `packages/bigname/README.md`.

The doc has two layers. Sections 1 to 5 describe the branch against **deployed v0.4.1**. Section 6 describes what is **merged on bigname `main` and not deployed**, how the branch handles both versions, and what changes on screen when it deploys. Nothing in sections 1 to 5 depends on the undeployed release.

## How this was verified

- **Code.** Every row was re-read against the branch at `a3f750d5a`; "Before" columns were checked with `git show origin/main:<path>` only where the note says so.
- **Contract.** bigname docs at tag `v0.4.1` (`docs/api-v1.md`, `docs/api-v1-routes.md`, `docs/guides/expiry-sweep.md`, `docs/manifests.md`) and `git diff v0.4.1..origin/main` for the pending layer.
- **Live audit.** `.audit/v041-verify.md` in the `apps-monorepo-bigname-audit` checkout: about 740 read-only requests on 2026-10-05, run through the branch's own functions at `727714552`. Its items are cited as N1 to N10 (earlier breaks, all fixed), B1 to B4 (remaining) and C1, C2 (assumption censuses).
- **Spot checks** made on 2026-10-05 while writing this doc, read-only, named where used.
- **Linear.** Ticket states read on 2026-10-05.

Confidence marks:

| Mark | Meaning |
| --- | --- |
| **code** | Read in the branch. Says what the code does, not that bigname serves what the code expects. |
| **docs** | Stated by the bigname contract only. Everything about the undeployed release is `docs` at most. |
| **live** | Observed on Sepolia v0.4.1 on 2026-10-05. "(audit)" is the audit report, "(session)" a check from the working session that this doc did not re-run, "(spot)" a check made while writing. |
| **unverified** | Not confirmed either way. Listed again in section 11. |

The API was under a load test during the audit, so its timings are not representative.

## 1. Summary

| Screen | Difference against `origin/main` | Impact |
| --- | --- | --- |
| Every screen | Timestamps are decimal Unix-seconds strings on every row, so the block-timestamp RPC back-fills are gone (X2). | Improvement |
| Every list | Pages of 200, cursor walks, silent caps of 1,000 to 10,000 rows per walk (X8). | Neutral |
| Every ENSv1 expiry | The date shown is the BaseRegistrar lease (`ens_v1.expires_at`), not the top-level `expires_at`, which after the Universal Resolver cutover is the ENSv2 reservation (lease + 62 days) (X7). | Neutral; same date as before |
| Every list of names | ENSv1 registry-only subnames are listed by bigname but have no name page. The manager hides them; the portal lists them unlinked and mostly uncounted (X15, TYR-228). | Regression until TYR-228 |
| Manager dashboard | One `relation=any` walk per connected address; names the address only manages now appear; grace applies to `.eth` second-level names only; an ENSv2 name in its 28-day grace drops off the list, so its "Renew" cannot show (3.1, B3). | Mixed; one regression to fix |
| Manager migration | One two-authority walk plus one lookup batch feed the `V1Domain` adapter; registry-only subnames cannot be migrated from the flow; the NameWrapper expiry is served, with a derivation as fallback (3.2). | Regression for registry-only subnames |
| Manager profile | ENSv1 `.eth` expiry comes from bigname instead of the chain; "Registered" has no chain fallback for ENSv1 (3.3). | Neutral |
| Manager pricing, landing, search | The owned count includes ENSv1 leases; landing redirects ENSv1-only owners (3.4). | Neutral |
| Portal address names | Resolve-only names kept under "Names assigned"; role badges from relations; registry children unlinked; an ENSv2 name in grace drops off (4.1, B3). | Mixed |
| Portal profile | Expiry and grace from bigname for both eras; the records tab says when a name does not resolve (4.2). | Improvement |
| Portal history timeline | Twelve type chips; `release`, `expiry`, `authority` and `migration` rows; derived ENSv1 token ids; no cost, referrer, operator, canonical id or ENSv2 token id until the pending release (4.3, R3). | Improvement for coverage, regression for explorer detail |
| Portal address and record history | One stream for both eras, capped at 1,000 rows; record history covers every resolver the name used (4.4, 4.5). | Improvement |
| Portal registry pages | Occupant check is two count reads; the history feed carries its own total (4.6). | Improvement |
| Portal resolver page | Node count is "200+" for large resolvers; the Nodes page fails for the public ENSv1 resolver; no "Inactive" rows (4.7, B1, TYR-240). | Regression |
| Portal resolution page | Names on any EVM coin type are listed; registry-only subnames are missing (4.8). | Mixed |
| Portal recent activity | ENSv1 activity appears; rows worded by bigname type (4.9). | Improvement |
| Portal roles | Name role holders and history come from bigname `permission` rows; registry root roles still scan logs until the pending release (4.12, R4). | Improvement |
| Portal sync after writes | Waits on `/v1/status` instead of blind polling (4.11). | Improvement; timing change |
| api-worker faucet gate | One two-authority walk, live rows only, fail-closed (5.1). | Neutral |
| api-worker expiry reminders | Four tracks, correct 90-day grace stages for ENSv1, lapsed owners reached, subname notices without a renew action (5.2). | Improvement |

## 2. Cross-cutting differences

### X1. One source instead of two

Before, the manager read the ENSv1 subgraph and Panoptes and merged in the browser, the portal did the same through ensjs `subgraph` actions, and the api-worker read a third host.

Now there is one host per network, resolved by `@ens-apps/config` (`endpoints.bignameApi`; `https://sepolia.api.bigname.sh` on Sepolia, `null` on mainnet because no mainnet deployment exists; `VITE_BIGNAME_API_URL` overrides it), and one client (`packages/bigname`). `packages/indexer`, `@urql` and the GraphQL codegen are deleted. Both CSP files allowlist the bigname origin instead of the subgraph hosts (`apps/manager/src/server/csp.ts`, `apps/portal/src/worker/csp.ts`). The e2e stack runs no indexer: with `E2E_MOCK_BIGNAME=true` (set in `e2e/.env.ci`) Playwright serves bigname's `/v1` routes from `e2e/helpers/mock-bigname.ts`, which is typed against the client and serves v0.4.1 shapes. The mock covers browser requests only, so SSR reads still reach the real deployment. Confidence: code. The e2e suite was not run against the mock in the audit (N9 was a static check).

### X2. Timestamps are decimal Unix-seconds strings

Every timestamp arrives as a decimal string of Unix seconds (`"1803965433"`). `packages/bigname/src/time.ts` accepts only that form: `timestampToBigInt` is exact, `timestampToSeconds` is undefined above the safe-integer range, and an RFC 3339 string parses to undefined. An absent expiry is `expires_at: null` with `expires_at_reason` (`no_expiry`, `not_set`, `released`), not an omitted field. Expiries can exceed `2^53`; 465 `.eth` leases are saturated at `9223372036854775807` (B4).

History rows carry their own timestamp, so the block-timestamp RPC back-fills are deleted. `getBlockTimestamps` survives only for the registry root role history, which still scans logs (P12.3).

Confidence: code; live (audit N1: 4,654 timestamp values across 63 responses, none unparseable).

### X3. Missing values are statuses, not nulls

A single-resource miss is `404`, a known-empty collection is `200 []`, and a name bigname cannot vouch for is `status=unsupported`. The client maps `404` to `null` where the caller wraps the read in `nullOnNotFound`. What the branch does with `unsupported`:

- Manager search counts it as held, so the search box says "Registered" (`apps/manager/src/features/search/nameIndexStatus.ts`).
- Manager profile owner falls through to the ENSv1 chain read on `404`, `unsupported` or a non-ENSv2 authority. Any other bigname failure surfaces as `GetOwnerError` (`features/profile/service/profileOwner.ts`).
- Migration list: an `unsupported` lookup record is skipped, and a listed name with no lookup record is dropped silently (`v1Names.ts`).
- Profile replay: a record without `records` is left out, which raises `ProfileFetchError{phase:'indexer'}` (`v1ProfileKeys.ts`).

No screen renders a distinct "unavailable" state. Confidence: code. No `unsupported` name was exercised live.

### X4. `authority` replaces `protocol` and `isMigrated`

`ens_v0` (the 2017 registry) is treated as ENSv1 everywhere: `protocolForAuthority` in the manager, the migration walk and the faucet (both now one request with `authority=ens_v1,ens_v0`), the portal address list and `useMigrationStatus.ts`. `is_migrated=true` drives the migrated-names count and means a proven ENSv1 to ENSv2 transition only (M2.4). Confidence: code.

### X5. Overlap refusal retired; a released ENSv2 registration keeps the name

A current ENSv2 registration wins without proof, and a released ENSv2 registration keeps the name with ENSv2. The portal's migration prompt reads `authority` and hides for such a name even while an ENSv1 lease is live (P10.1). Confidence: code for the prompt; the contract statement was written against a pre-v0.4.1 build and was not re-read, so it is unverified.

### X6. Relations

`registrant` is gone as a relation and as a row field; it exists only in history `registration` payloads. The relations are:

| Relation | Meaning |
| --- | --- |
| `owner` | The token holder (BaseRegistrar, NameWrapper or ENSv2 token), else the registry owner. Never the wrapper contract. |
| `manager` | The account that can change the registry record. Omitted while a wrapped `.eth` second-level name is in registrar grace, on released names, and where the NameWrapper state is unknown. |
| `role_holder` | Holds an ENSv2 registry role on the name. |
| `resolves_to` | An address record of the name points at the address. |
| `former_owner` | The last holder of a released registration. Not part of `any`. |

Every chip-driving read uses `relation=any`. A released row has neither `owner` nor `manager`; its last holder is `lapsed_registration.owner`. Because an ENSv2 registration is released from the second it expires, an ENSv2 name in its 28-day grace is not in `relation=any` at all (B3, section 8).

Two visible consequences: a wrapped `.eth` name in registrar grace shows Owner without Manager (M1.4, P1.3), and ENSv2 role-only holders get the Manager chip from `role_holder` (M1.4).

Confidence: code; live (audit N2) for `owner` and `manager`. The grace behaviour is docs only until about 2026-10-30, when the first ENSv2 names on Sepolia expire.

### X7. Expiry and grace

| Row | `expires_at` (top level) | `ens_v1.expires_at` | `grace_ends_at` |
| --- | --- | --- | --- |
| ENSv2 `.eth` name | Registration expiry | absent | expiry + 28 days |
| ENSv1 `.eth` name, reserved in ENSv2, after the cutover | The ENSv2 reservation's expiry: lease + 62 days | The lease | Reservation expiry + 28 days, which is lease + 90 days |
| ENSv1 `.eth` name with no live reservation | The lease | The lease | lease + 90 days |
| Wrapped ENSv1 subname | NameWrapper entry expiry | `null` | equal to `expires_at` |
| ENSv2 subname | Registry entry expiry | absent | equal to `expires_at` |

Both apps show `ens_v1.expires_at ?? expires_at` (`addressNameExpirySeconds` in the manager, `utils/names/servedExpiry.ts` in the portal), so an ENSv1 name shows its lease date, as it did before. A held row with no finite expiry renders "Does not expire". That includes the 465 saturated leases (B4).

Grace is computed differently per app:

- The manager ignores `grace_ends_at` and adds 90 or 28 days itself (`packages/utils/src/gracePeriod.ts`), on `.eth` second-level names only.
- The portal adds 90 days to the ENSv1 lease and reads the served `grace_ends_at` for ENSv2 names and subnames.
- The api-worker reads `grace_ends_at` on every row.

All three agree on every row the audit checked (N5). `lapsed_registration.owner` is on released rows, including on lists (N8: 708 of 708 released ENSv1 rows in the sweep).

The 62-day gap is an invariant of the migration design, not a coincidence: a reservation expires at lease + 62 days (`CONTINUITY_BONUS_PERIOD` of 90 days less the 28-day ENSv2 grace), the BatchRegistrar that could extend a reservation alone is decommissioned in migration phase 6, before the cutover in phase 7, and `ETHRenewerV1` renews the lease and the reservation by the same duration (contracts-v2 at `07e55a05`, `contracts/docs/premigration.md` and `migration.md`). Live it held for all 67,804 ENSv1 `.eth` rows outside the 465 saturated leases and one lease-less name (C1).

Confidence: code; live (audit N5, C1); docs for the invariant.

### X8. Paging, retries and caps

`MAX_PAGE_SIZE` is 200. `fetchAllPages` stops at `maxPages` (100) or `maxRows` (10,000) and reports `truncated`; most callers ignore it, so those walks cap silently. The client retries network errors, 408, 429, 502, 503, 504 and `409 stale` up to three times with backoff. It does not retry 500 or `409 conflict` (B2). A cursor holds only its sort position, so a stale page is retried with the same cursor; if it is still stale the walk restarts from page one, up to three times.

| Read | Cap | When exceeded |
| --- | --- | --- |
| Address names (dashboard, portal list, forward names) | 10,000 rows per walk | Silent; the migration walk throws instead |
| Record history | 1,000 rows | Silent |
| Address history, and its held-names read | 1,000 rows each | Silent |
| Resolver links, roles | 1,000 rows each | Silent |
| Resolver nodes | 2,000 rows | "Showing the first N nodes." on the Nodes page only |
| Resolver events | One page of 200 | Heading shows the served total |
| Name role changes | 2,000 rows, oldest first | Silent; the newest changes would be missed |
| Registry labels table | One page of 100 | Silent |
| Subregistry slot | One page of 50 | Zero links with more rows reads as unknown |
| Faucet | 5 pages of 200 per direction | Treated as no live name (B4) |
| Expiry sweep | 1,000 rows per window, 5,000 per exact second | Overflow alert |

Confidence: code.

### X9. Counts

Every counter accepts `null`. On v0.4.1 the ownership relations of address names always return an exact `page.total_count`; `GET /v1/names`, `resolves_to`, `former_owner` and resolver `bound_names` return `null`. So:

- The manager's owned-registrations count and migrated-names count are served totals (M4.1, M2.4).
- The portal "Names (N)" heading and the manager dashboard count are client counts of loaded rows.
- The resolver node count is the first page's length with a "+" (P7.1).
- The registry history feed asks for `include=total_count` and shows it (P6.6).
- Name history returns a total without being asked (live, spot: `nick.eth` 51).

The pending release makes the address-names total `null` above 1,000 candidate names (R2). Confidence: code; live as noted.

### X10. Freshness

The api-worker reads `meta.as_of`: one probe per sweep run gives the publication time, and stage windows are placed against `min(wall clock, publication time)` (W2.12). The portal polls `/v1/status` after a write until `indexed_block` reaches the target block (P11.1). No other code reads either. `/v1/status` was `ready` with zero lag throughout the audit. Confidence: code; live (audit).

The old note that name detail carries `Cache-Control: max-age=12` was not re-checked and is unverified.

### X11. `namespace`

On Sepolia there is one namespace, so nothing changes today. On a deployment that also admits Basenames, a read that omits `namespace` could gain `*.base.eth` rows.

| Passes `namespace: 'ens'` | Omits it |
| --- | --- |
| Portal address names (both walks), forward names (walk and lookup) | Portal address history and its held-names read, subnames, recent activity, name and contract history, record history, subregistry slot, name role changes, resolver events, every name-detail and records read |
| Manager dashboard, owned count, `hasOwnedNames`, primary-name candidates | Manager migration walk and lookup, migrated count, profile replay keys, every name-detail read |
| api-worker sweep | api-worker faucet |

Confidence: code.

### X12. ENSv1 "Registered" dates on Sepolia

The earlier version of this doc said names registered through an unadmitted Sepolia controller have no `registered_at`. That is wrong for Sepolia. The Sepolia profile admits no registrar controller for registrations and builds the ordinary registrar lifecycle from the BaseRegistrar's own numeric `NameRegistered` and `NameRenewed` events (`docs/manifests.md`, "ENSv1 (`sepolia` deployment profile)"). What a controller-less registration lacks is the label, not the date: such a name is served as `[labelhash].eth`.

So an ENSv1 `.eth` name with a known label has `registered_at`. Confidence: docs; live (spot: 2,400 ENSv1 `.eth` rows across two expiry windows, held and released, every one with `registered_at`). That names shown as `[labelhash].eth` lack it is live (session); the spot sample contained no such row.

The mainnet profile works the other way round: its admitted controller set is the whole of registration intake, and BaseRegistrar events derive no registration fact. No mainnet deployment exists, so this is docs only, but it should be re-read before one does.

### X13. A stored zero address is absence

The forward-resolution page inherits this (P8.1). Carried over from the earlier doc; not re-read against v0.4.1, so unverified.

### X15. Registry children without a name row

An ENSv1 subname created by `setSubnodeOwner` or `setSubnodeRecord` and never wrapped has no name row in bigname. v0.4.1 lists it on address names and subnames as `registration_status: unregistered` with no `created_at`, and every name route answers `404` for it. The branch detects it by that pair of facts (`apps/portal/src/utils/names/registryChildName.ts`, `v1Names.ts`, `isListedAddressName`).

- The manager drops these rows everywhere (dashboard, profile list, primary dialog, landing check, migration list).
- The portal lists them unlinked, sorted last, with the tooltip "No name record: bigname lists this registry child but has no page for it". They are left out of "Names (N)" on the names page and "Go to full list (N)", but counted in "Names assigned to this address (N)", "Show more (N total)" and "Subnames (N)".
- A label bigname does not know is spelled `[<64 hex>]`; the portal displays it as "[label unknown]".

Confidence: code; live (audit C2: all 62 flagged rows answer 404, 69 of 69 sampled unflagged rows answer 200). The contract defines no explicit flag, so this rests on `created_at` being omitted. TYR-228 gives these names a real name row (section 7).

### X16. Names with no live ENSv2 entry

After the cutover, resolution starts in ENSv2. A name with no live ENSv2 entry is served with `unresolvable_reason: no_live_ens_v2_entry`, no `resolver` and no `records`. The portal records tab says so (P2.6). Nothing else branches on it: the manager migration adapter reads the missing `resolver` as "no resolver", and neither app tells the user upfront that such a name is not reserved for ENSv2 and cannot migrate (section 8). Confidence: code; live (audit: `a1.bobbyc.eth`, `alnasa.eth`).

This replaces the retired X14 ("ownerless ENSv2 reservation resolver is not served"), which described a pre-cutover build.

## 3. Manager

Paths are relative to `apps/manager/src/` unless they start with `packages/` or `workers/`.

### 3.1 Dashboard "My names"

`features/dashboard/service/queries/getDashboardNames.ts` walks `GET /v1/addresses/{a}/names?namespace=ens&relation=any&sort=name&include=role_summary&page_size=200` for each connected address (EOA, smart account, owner) and, on a `422 unsupported`, walks again without the include. `features/dashboard/dashboardNames.ts` merges rows by namehash (unioning `relations`, `role_summary` and `is_primary`), keeps rows whose status is `active`, `wrapped` or `registered`, and maps the rest.

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| M1.1 | One list, still client-sorted | Two lists merged; a migrated name's ENSv1 row hidden by name match. | One row per name from one collection per address. Sorting stays client-side with `localeCompare`, so the order is unchanged. | `dashboardNames.ts` | Neutral | code |
| M1.2 | Which addresses' names appear | ENSv2 rows for the three addresses (`owner_in`); ENSv1 rows for `ownerAddress ?? address` only. | Both eras for all three addresses. Names an address only manages now appear. | `useDashboardNames.ts` | Improvement; more rows | code |
| M1.3 | Released, unregistered and in-grace names | ENSv1 filtered by `expiryDate_gt: now`; ENSv2 rows past expiry shown with a past date. | `isListedAddressName` drops `released` and `unregistered` rows, which includes registry children (X15). An ENSv1 lease in its 90-day grace is still held and still listed. An ENSv2 name is `released` from its expiry and is not in `relation=any`, so it leaves the dashboard at expiry (B3). | `dashboardNames.ts` | Regression for ENSv2 names in grace; fix in section 8 | code; docs for the ENSv2 half |
| M1.4 | Owner and Manager chips | ENSv1 from registrant, wrapped owner and owner; ENSv2 "Owner" always plus "Manager" from any role bitmap. | Owner when `relations` has `owner`. Manager when it has `manager` or `role_holder`, or an ENSv2 grant for a connected address is in `role_summary`. An empty summary never removes a chip. A wrapped `.eth` name in registrar grace shows Owner only. | `getAddressNameRoles` | Improvement; one visible change in grace | code; live (audit N2) |
| M1.5 | "Created" sort | ENSv1 rows had no `createdAt` and sorted last. | `created_at` on every listed row (audit: null on 0 of 110). | `dashboardNames.ts` | Improvement | code; live (audit N1) |
| M1.6 | Search | Substring over label or name. | Substring over `name`, client-side. | `filterAndSortDashboardNames` | Neutral | code |
| M1.7 | Expiry text and grace | `0` "Does not expire"; grace on every row by protocol. | The date is `ens_v1.expires_at ?? expires_at` (X7). A held row without a finite expiry renders "Does not expire". Grace is client-side (90 or 28 days) and applies only to `.eth` second-level names, so a subname gets no grace window. | `addressNameExpirySeconds`, `dashboardRowMetadata` | Neutral for `.eth` names; subnames lose a grace state that was wrong for them | code; live (audit N5) |
| M1.8 | Primary marker | ENSv2 rows matching the reverse-resolved label. | Unchanged. bigname's `is_primary` is merged into the row but not read here. | `dashboardNames.ts` | Neutral | code |
| M1.9 | Owned count chip | Merged-array count. | `names.length` after the status filter. | `NamesTable.tsx` | Neutral | code |
| M1.10 | "ENSv1 only" and "Eligible for upgrade" pills | From the data source. | `protocol` from `authority`; eligibility from `classifyNames` over the bigname-fed list, matched by lowercased name. A failed eligibility read no longer blanks the list. | `useDashboardMigrationEligibility.ts`, `MyNamesList.tsx` | Neutral | code |
| M1.11 | Bulk renew selection | ENSv2 only, null and past-grace excluded. | Same rule on `protocol === 'v2'`. | `bulkRenewSelection.ts` | Neutral | code |
| M1.12 | Displayed name | ENSv2 rows showed the raw Panoptes name. | `row.name` as served. | `dashboardNames.ts` | Neutral | code |

### 3.2 Migration: eligibility, "N names upgraded", profile replay

`features/migration/service/v1Names.ts` makes one walk, `relation=any&authority=ens_v1,ens_v0&sort=name&include=role_summary` (no `namespace`), and throws if the walk is truncated. On `422 unsupported` it walks again without the include, which also loses `restrictions`. It drops `*.addr.reverse`, `released` rows and registry children without a name row, then reads `POST /v1/lookup` (`profile=detail`, no `include`, batches of 1,000) for the names and for parents not in the list. `packages/migration/src/service/v1Domain.ts` (`v1DomainFromBigname`) adapts each record into the `V1Domain` shape `classifyNames` still reads. `packages/dev-migration-tool/src/bignameMock.ts` serves the same three reads in v0.4.1 shapes for panel-created names.

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| M2.1 | Eligibility inputs | Subgraph `labelName`, `owner`, `registrant`, `wrappedOwner`, `wrappedDomain`, `registration`, parent fuses. | See the list below the table. | `v1Domain.ts`, `v1Names.ts` | Neutral for the eligible list | code; live (audit N2, N3: 0 mismatches across 96 `.eth` names) |
| M2.2 | Registry-only subnames | `setSubnodeOwner` children with `labelName: null` were listed and classified. | bigname lists them without a name row and lookup answers `not_found`, so the manager drops them (X15). The "registry-child" copy route has no candidates from the list, and the unknown-label ineligible entries for them are not shown. | `isListableV1Row` | Regression: such subnames cannot be migrated from the flow (TYR-228) | code; live (audit N7) |
| M2.3 | `wrapped` status without wrapper fields | n/a | `registration_status: wrapped` with no `ens_v1.wrapper_state` or `wrapper_fuses` is treated as an expired wrapper, `{expiryDate: '0', fuses: 0}`. bigname omits the fields while the NameWrapper state is unknown or has lapsed. The earlier `nick.eth` example no longer applies: it serves `wrapper_state: emancipated` (live, spot). | `wrapperEntry` | Neutral | code; whether any live row takes this branch is unverified |
| M2.4 | "N out of T names upgraded" and the banners | Panoptes `domainConnection` with `isMigrated: true`. | `relation=owner&is_migrated=true&dedupe=name&page_size=1`, `getAddressNamesCount` (exact on v0.4.1; `null` when unknown after the release, see R2): proven migrations only. Drives the progress banner, upgrade banner, modal and the commemorative NFT gate. | `getMigratedNamesCount.ts` | Neutral by construction | code; parity with Panoptes is unverified |
| M2.5 | Profile replay keys | Subgraph `texts`, `coinTypes`, `contentHash`, `abiChangeds`. | Lookup `records`: texts from `seen_texts` and coin types from `seen_addresses`, each minus keys whose value is `null` (cleared); a content hash when `seen_singletons` has it and it is not `null`. A seen key missing from its value map is still read on-chain. A record without `records` raises `ProfileFetchError{phase:'indexer'}`. | `v1ProfileKeys.ts` | Neutral | code; live (audit N4) |
| M2.6 | ABI content types | `abiChangeds` then on-chain `ABI(node, type)`. | `seen_abis` as listed. When it is omitted, the code probes content types 1, 2, 4 and 8 on-chain, so a non-standard type behind an omitted list is not copied. Cleared ABI entries are not filtered out. | `PROBED_ABI_CONTENT_TYPES` | Neutral for the four standard types | code |
| M2.7 | Error copy phase | `phase: 'subgraph'` | `phase: 'indexer'`; user copy unchanged. | `decodeMigrationError.ts` | Neutral | code |

M2.1 in detail:

- **Label.** `labelName` is the first label of `name`. A `[64 hex]` label is kept as a placeholder. A name whose `namehash(name)` does not match the served `namehash` gets `labelName: null`.
- **Registry owner.** For a `.eth` second-level name `manager ?? owner`, otherwise `owner ?? manager`.
- **Registrant.** bigname serves none. It is synthesized from `owner` for an unwrapped `.eth` second-level name only.
- **Wrapped owner.** `owner`, when a wrapper entry exists.
- **Wrapper entry.** Present when `ens_v1.wrapper_state` and `ens_v1.wrapper_fuses` both are.
- **Wrapper expiry.** The served `restrictions.wrapper_expires_at` from the address-names row when the walk carried `role_summary`: an exact value, or `null` meaning max uint64 for `no_expiry` and `0` otherwise. Without it (the 422 fallback, or the portal's single-name read in P10.1) the expiry is derived: lease + 90 days for a wrapped `.eth` second-level name, the top-level `expires_at` for a wrapped subname.
- **Registration expiry.** `ens_v1.expires_at` for `.eth` second-level names.
- **Cut-off.** A name leaves the list when bigname serves it `released`. There is no client 90-day maths.

The derived wrapper expiry is not always right. `allara.eth` was renewed twice directly on the BaseRegistrar and serves a wrapper expiry earlier than its lease. Across 64 wrapped rows the derived and served values agreed on 63 and the classification was the same on all 64 (audit). The pending release serves the wrapper's own expiry everywhere (R1).

### 3.3 Profile (own profile, address profile, name profile)

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| M3.1 | Address profile "Names" list | Four reads and a merge; names starting with `[` and `.addr.reverse` names filtered out. | `getAllAddressNames(address, {sort: 'registered_at', order: 'desc'})`, the dashboard's status filter and chips; a row with no chip is dropped; `owned` when the Owner chip is present, else `managed`. The `[` filter is gone, so a held name with an unknown label now appears. | `features/profile/service/profileAddressNames.ts` | Improvement | code |
| M3.3 | Expiry line | `0` "Does not expire"; null no line. | `addressNameExpirySeconds`, as M1.7. | `profileAddressNames.ts` | Neutral | code |
| M3.4 | Name profile owner and protocol | On-chain ENSv2 owner, Panoptes `Domain` existence for a zero-owner name, then ENSv1. | On-chain ENSv2 owner first. For a zero-owner second-level name, `GET /v1/names/{name}`: `authority === 'ens_v2'` means ENSv2, and the registry's `getState` supplies the last owner while the client-side 28-day grace runs. `404`, `unsupported` and any other authority fall through to the ENSv1 chain read. `lapsed_registration.owner` is not used. | `profileOwner.ts` | Neutral | code |
| M3.5 | "Registered" date | Subnames from Panoptes; ENSv2 names Panoptes then chain; ENSv1 via ensjs history plus `getBlock`. | `registered_at` from name detail first. Without it, an ENSv2 second-level name falls back to on-chain `getRegistrationDate`; an ENSv1 name and a subname show no date. On Sepolia an ENSv1 `.eth` name with a known label has the date (X12). | `profileRegistration.ts` | Improvement | code; live (spot, X12) |
| M3.6 | "Expires" for subnames | Panoptes `expiryDate`. | `expires_at` from name detail; `null`, `404` or any failure renders as no expiry; no grace. | `profileExpiry.ts` | Neutral | code |
| M3.7 | "Expires" for `.eth` names | On-chain for both eras; ENSv1 `0` was "non-expiring". | ENSv2 is unchanged (on-chain). ENSv1 reads `ens_v1.expires_at` from name detail and adds the 90-day grace client-side. An ENSv1 name bigname has not indexed shows no expiry, and an ENSv1 name can no longer be reported non-expiring. | `getV1LeaseExpiry` in `profileExpiry.ts` | Neutral; one source moved off-chain | code |
| M3.8 | Record keys to read on-chain | Panoptes `resolver.texts` and `addresses`. | `GET /v1/names/{name}/records?include=inventory`: `known_keys` and `unsupported_keys`, unioned with the static lists; values on-chain. | `profileRecords.ts` | Neutral | code |
| M3.10 | Upgrade prompt | From the migration list. | Same list, bigname-fed (M2.1). | `useV1Names.ts` | Neutral | code |

### 3.4 Pricing, landing and search

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| M4.1 | Owned registrations count (auto primary-name setup) | Panoptes `registrationConnection` (ENSv2 only). | `namespace=ens&relation=owner&parent=eth&dedupe=registration&page_size=1`, `getAddressNamesCount` (exact on v0.4.1; `null` when unknown after the release, see R2). ENSv1 leases now count; `parent=eth` keeps out subnames and registry children. | `features/shared/service/ownedNamesCount.ts` | Neutral; the `< 5` default can flip for addresses with ENSv1 names | code; live (audit N2) |
| M4.2 | Landing redirect | Panoptes `domains(where: {owner}, first: 1)`. | Pages `relation=owner` in pages of 50 and redirects at the first held row. Released rows and registry children never cause a redirect, so the earlier "lapsed ENSv2 name redirects to an empty dashboard" edge is gone. ENSv1-only owners now redirect. A failed read in `beforeLoad` keeps the user on the landing page. | `hasOwnedNames.ts`, `routes/index.tsx` | Neutral | code; live (audit N7) |
| M4.3 | Search classification | On-chain owner or Panoptes existence. | `200` with a held status or `unsupported` is `held`; `released` or `unregistered` is `released`; `404` and `400 invalid_input` are `not_indexed`. Combined with the on-chain owner read as before. | `nameIndexStatus.ts` | Neutral | code |

### 3.5 Primary name dialog

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| M5.1 | Candidate list | Panoptes `domains(where: {owner: connected})`, first 100 by name. | `relation=owner&authority=ens_v2&sort=name&page_size=100` for the connected wallet, one page, status filter, `is_primary` rows first. The reverse name is still read on-chain to preselect. ENSv1 names stay out by choice. On a smart-account session the candidates (connected wallet) and the reverse name (owner address) can be for different addresses. | `getPrimaryNameCandidates.ts`, `ChoosePrimaryNameDialog.tsx` | Product decision | code |

### 3.6 Grace banners and the notification inbox

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| M6.1 | Dashboard grace banner and "Renew" call to action | First ENSv2 row in grace by ascending expiry. | Same computation over the dashboard list. Because an ENSv2 name in grace is not in that list (M1.3), the any-name banner and the in-grace "Renew" can never show from bigname data. The primary name's banner reads the chain and is unaffected. | `resolveDashboardGraceBanner.ts`, `getExpiryCta` | Regression (B3); fix in section 8 | code; docs |
| M6.2 | Grace constants | 90 days ENSv1, 28 days ENSv2, client rules. | Unchanged in the manager, which does not read the served `grace_ends_at`. They agree today (X7). | `packages/utils/src/gracePeriod.ts` | Neutral | code |
| M6.4 | Expiry notices for subnames in the inbox | Every notice read as a `.eth` expiry. | A name that is not a `.eth` second-level name gets "This name is expiring soon" or "This name has expired", with "The owner of {parent} can extend it." and no action. | `features/notifications/notifications/name-expiry.tsx` | Improvement | code |

## 4. Portal

Paths are relative to `apps/portal/src/`.

### 4.1 Address names (`/addr/$addr`, `/addr/$addr/names`) and search suggestions

`features/dashboard/hooks/useAddressNames.ts` walks `relation=any&namespace=ens&include=counts,role_summary&sort=expires_at&order=asc` (falling back to `include=counts` on `422`), then a second walk with `relation=resolves_to&coin_type=60`, and merges the two by namehash. `utils/names/addressNames.ts` maps rows to the table shape and re-sorts them.

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P1.1 | Names that only resolve to the address | Included by ensjs's `resolvedAddress` clause (coin 60), one 100-row page shared with owned names. | The second walk adds them with `relations: ["resolves_to"]`, no badge, under "Names assigned to this address" unless the address holds their `.eth` parent. bigname also matches an ENSIP-19 default EVM record that no `addr:60` shadows, and resolve-only ENSv2 names, neither of which the subgraph had. If the second read fails, the whole list errors. | `withResolvedNames` | Restored | code; live (session) |
| P1.2 | "N Role(s)" badge on ENSv2 rows | Set bits of the Panoptes bitmap. | Grants for the viewed address with scope `root`, `registry` or `registration` and no `grant_relation`, mapped power by power to ensjs roles (20 powers; an unmapped power is dropped) and counted. An empty summary shows no badge, which is not proof of no roles. | `registryRoleBitmap`, `lib/roles/registryPowerRoles.ts` | The number can change where a power maps to no role | code |
| P1.3 | Owner and Manager badges on ENSv1 rows | From `owner`, `registrant`, `wrappedOwner`. | Owner when `relations` has `owner`; Manager when it has `manager`. The Manager badge drops while a wrapped `.eth` name is in registrar grace. | `v1RolesFromRelations` | Neutral | code; live (audit N2: 71 of 71 rows Owner + Manager) |
| P1.4 | Records and Subnames counts on mobile cards | ENSv2 rows only. | `subname_count` and `record_count` on every row. | `NameMobileCard.tsx` | Improvement | code |
| P1.5 | Expiry cell, released rows | ensjs excluded expired ENSv1; Panoptes listed expired ENSv2. | Expiry and grace from `servedExpiry` (X7); no finite expiry renders "Does not expire". Released ENSv1 rows are dropped. The filter keeps released ENSv2 rows, and a code comment says expired ENSv2 names are still listed, but under the contract a released ENSv2 row is not in `relation=any`, so none arrives (B3). | `isLapsedV1`, `servedExpiry.ts` | Regression for ENSv2 names in grace; fix in section 8 | code; docs |
| P1.6 | Caps and "Names (N)" | ENSv1 stopped at 100. | Full walk to 10,000 rows. "Names (N)" is a client count of loaded rows that have a name page. | `routes/addr/$addr/names.tsx` | Improvement | code |
| P1.7 | Sort order | Expiry ascending, null last. | Client sort: rows with an expiry by the displayed date ascending, then rows without one, then registry children. | `byDisplayOrder` | Neutral | code |
| P1.8 | Search "Names you own" | ENSv1 names plus each owned ENSv2 name and all its `subdomains`. | The address-names list (shared cache entry), substring match, without registry children. A subname of an owned name is suggested only when the address also holds or manages it. A per-name `/subnames` fan-out was tried and dropped: across about 700 ENSv2 owners on Sepolia no live subname with a name row was outside its owner's `relation=any` read. | `features/dashboard/hooks/useSearchResults.ts` | Small accepted regression; nothing missing on Sepolia today | code; live (session) |
| P1.9 | Acquired or assigned | `v1Roles.owner` plus the `.eth` ancestor rule. | A `.eth` second-level name with `owner` in `relations` is a root; `manager` alone is not. | `features/address/nameAttribution.ts` | Neutral | code |
| P1.10 | Error copy | Two banners (not re-checked on `origin/main`). | One: "Error fetching names. Please refresh the page." | `NameList.tsx` | Neutral | code |
| P1.11 | Registry children and unknown labels | Listed as ordinary names. | Unlinked, sorted last, partly uncounted; `[hash]` labels read "[label unknown]" (X15). | `NameBadge.tsx`, `registryChildName.ts` | Regression until TYR-228 | code; live (audit N7) |

### 4.2 Profile overview, records tab, subnames, renew

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P2.1 | ENSv1 "Registered" and "Expires" rows | First `NameRegistered` block via ensjs, then `useBlock`; expiry on-chain. | `registered_at` from name detail, linked to the oldest `registration` history row; omitted when absent. "Expires" is the lease from `servedExpiry`, and "Grace ends" shows in grace. No on-chain expiry read. | `ExpiryWithRegistrationData.tsx`, `useV2RegistrationData.ts` | Improvement | code; live (audit N5) |
| P2.2 | ENSv2 "Expires" row and the max-uint64 crash | `Timestamp(expiry)` unguarded. | A `null`, unparseable or out-of-range expiry yields no row. In grace the row reads "Grace ends" instead of "Expires". | `useV2RegistrationData.ts` | Fixes a latent crash | code |
| P2.3 | ENSv2 "Registered" tx badge | Panoptes earliest `NameRegistered`. | The oldest `registration` row (`order=asc&page_size=1`). A migrated name keeps its ENSv1 registration time. | `ExpiryWithRegistrationData.tsx` | Neutral | code; live (audit: `asnalia.eth`) |
| P2.4 | Grace status | ENSv1 from on-chain `getExpiry`; ENSv2 from the indexer plus a client 28 days. | Both eras from name detail: ENSv1 lease + 90 days, ENSv2 and subnames from `grace_ends_at`. `useV1Expiry.ts` is deleted. | `useGraceStatus.ts` | Neutral | code |
| P2.5 | Subnames count card | Length of a 100-row page. | `GET /v1/names/{name}/subnames?include_expired=false&page_size=1` `total_count`; `404` is `0`. It can exceed the table's row count by the rows P2.8 drops. | `getSubnameCount` | Improvement | code |
| P2.6 | Records tab | Subgraph and Panoptes keys merged with defaults, values on-chain. | For a resolvable name, `records?include=inventory` keys unioned with the defaults, values on-chain. For a name with `unresolvable_reason`, no on-chain read: the tab shows "This name does not resolve", with "Resolution now starts in ENSv2, and this name has no live ENSv2 entry, so it resolves to nothing. It keeps its owner and registration." for `no_live_ens_v2_entry`. Other consumers of the profile query get empty records for such a name. | `useProfile.ts`, `routes/$name/records.tsx` | Improvement in honesty | code; live (audit) |
| P2.8 | Subnames table rows | ensjs (ENSv1) or Panoptes (ENSv2). | One walk of `subnames?include_expired=false&sort=name`. Dropped: rows without `owner`, and labels that are escaped, not normalized or do not hash to `labelhash`. Kept: `[labelhash]` children, shown as "[label unknown]", and children without a name row, unlinked and sorted last. "Subnames (N)" counts every kept row. | `toSubnames` in `useSubnames.ts`, `SubnamesTable.tsx` | Improvement | code; live (audit N7) |
| P2.9 | "Already registered" check on create-subname | `labelName` match over the list. | Same match. A child with an unknown label has `labelName: null` and never matches, so the on-chain write still fails for a taken unknown label. | `routes/$name/create-subname.tsx` | Edge unchanged | code |
| P2.10 | "No subregistry" state | On-chain and indexer reads. | Unchanged route logic. | `routes/$name/subnames.tsx` | Neutral | code |
| P2.11 | Protocol row "ENSv1 : Can be migrated" | On-chain detection plus `useMigrationStatus`. | Name detail and the parent (P10.1). | `useMigrationStatus.ts` | Neutral | code |
| P2.12 | Renew flow | ENSv1 expiry from on-chain `getExpiry`. | `useCanExtend` reads name detail for both eras. On completion the flow invalidates the on-chain renewable check and the bigname read, then waits for bigname (P11.1). | `features/renew/hooks/` | Neutral; depends on indexing lag | code |

### 4.3 History timeline

`features/history/timelineEventPage.ts` reads `GET /v1/names/{name}/history?include=data,raw` (plus `child_registrations` for the unfaceted full history, never for `eth` or `base.eth`), with a `type` set, `from_timestamp` and `to_timestamp`, `order` and cursor, 100 rows per page. `features/history/eventTypes.ts` holds the vocabulary: twelve types. `summarize/descriptors.ts` and `summarize/summarizeEvents.ts` word the rows.

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P3.1 | One stream for both eras | Auxiliary uncursored ENSv1 read, truncation notice, RPC timestamps. | One cursor. The "too large to read" notice is gone. | `hooks/useNameHistoryTimeline.ts`, `HistoryTimeline.tsx` | Improvement | code |
| P3.2 | Type chips and row badges | Sampled raw types, 27 labels. | Twelve chips: Registration, Renewal, Release, Expiry, Transfer, Registry owner, Resolver, Record, Primary name, Permission, Subregistry, Migration. The row badge is the raw `kind`, falling back to the type. A type the portal does not know renders generically instead of crashing. | `eventTypes.ts`, `EventRow.tsx` | Chip set changes | code; live (audit N6) |
| P3.3 | Wording and decoded parameters | `cost`, `tokenId`, `canonicalId`, `operator`, `sender` rendered. | See the list below the table. | `descriptors.ts`, `EventRow.tsx`, `historyTokenId.ts`, `eventFieldTypes.ts` | Regression for explorer detail until R3 deploys; the branch already renders the served fields | code; live (session, `ownerOf`) |
| P3.4 | Contract badge | Rebuilt for ENSv1. | `contract_address` when present; labelled "resolver" for `record` rows. | `EventRow.tsx` | Neutral | code |
| P3.5 | Grouping and order | Timestamp then id; grouped by tx hash. | Grouped by transaction; a row without one (`release`, a boundary `expiry`) is its own action. Actions sort by their newest row. | `summarizeEvents.ts` | Neutral | code |
| P3.6 | Total count | Omitted when truncated or filtered. | `page.total_count` of the last page; hidden on a client-filtered feed. v0.4.1 serves it without being asked. | `useHistoryTimeline.ts` | Improvement | code; live (spot) |
| P3.7 | Child registrations | First `LabelRegistered` of the first 25 subdomains. | `include=child_registrations` on the full history only; rows read "registered subname {child}". Registry-only children have no `registration` row and are absent. | `timelineEventPage.ts` | Improvement | code |
| P3.8 | Date range chip | Inclusive UTC day bounds. | `from_timestamp` and `to_timestamp` from the same bounds. | `filterTimeline.ts` | Neutral | code |
| P3.9 | Anchor (oldest 20) | Separate ascending read. | `order=asc&page_size=20` on the same route, one retry. | `useNameHistoryTimeline.ts` | Neutral | code |
| P3.10 | "Migrated ... to ENSv2" | `protocol` on NameWrapped and NameUnwrapped. | A `migration` row headlines its transaction as "migrated {name} to ENSv2 ({path})", with the path worded unwrapped, wrapped, locked, locked subname or emancipated subname. "Unwrapped from ENSv2" has no bigname equivalent and is gone. | `descriptors.ts` | Restored, except the unwrap row | code; live (audit N6) |
| P3.11 | Faceted feeds | Legacy event-name lists. | Ownership: `registration`, `renewal`, `release`, `expiry`, `transfer`, `authority`, `migration`. Resolver: `resolver`, `record`. Address-resolution sidebar: `type=record`, narrowed client-side to `addr:*`, `name` and keyless reset rows; its total is hidden. | `eventTypes.ts` | Row sets change per facet | code |
| P3.12 | Multi-record headline | n/a | "set N records" dedupes the legacy `AddrChanged` plus `AddressChanged` pair. | `summarizeEvents.ts` | Neutral | code |

P3.3 in detail:

- **Headlines.** "registered", "registered subname", "renewed", "released", "transferred {name} → {to}", "set registry owner to", "updated resolver to" or "cleared resolver", "linked subregistry" or "unlinked subregistry", "cleared records", "set primary name", "updated expiry".
- **Permissions.** "granted roles {list} to {account}" or "revoked roles {list} from {account}" when the row carries `added_powers` and `removed_powers`; otherwise "set roles {powers} for {account}". "added registrar controller" and "removed registrar controller" for that scope, and "set fuses" for a fuse-only row. The row itself reads "{n} powers held by {account}".
- **Token ids.** ENSv1 ids are derived and shown: the labelhash on BaseRegistrar rows and the namehash on NameWrapper rows, both checked with `ownerOf`. Such rows read "transferred token ID {id} to" or "minted token ID {id} to" and add `token_id` to the decoded table. ENSv2 ids are not derivable (the id carries a version counter history does not serve), so ENSv2 rows read "transferred to" or "minted to".
- **Gone until the pending release.** Cost, base cost, premium, payment token, referrer, operator and canonical id (R3).

### 4.4 Address history (`/addr/$addr/history`, recent five on `/addr/$addr`)

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P4.1 | Which names contribute | ENSv1 owner and registrant (no wrapped names), 100 names; ENSv2 nested events. | `GET /v1/addresses/{a}/history?relation=any&include=data,raw&order=desc`, up to 1,000 rows, or one page of 5 for the teaser. Wrapped ENSv1 names are included. Rows without a transaction, block or timestamp are dropped. | `features/address/hooks/useAddressHistory.ts` | Improvement; a 1,000-row cap replaces the 100-name cap | code |
| P4.2 | Acquired or assigned | `registrarHolder` per name from the indexer. | A second read, `relation=any` names up to 1,000 rows, marks a name held when `relations` has `owner`. | `readHeldNames` | Neutral | code |
| P4.3 | Decoded table | `[object Object]` refs, leaked `category` and `timestamp` rows. | Flat `data`. | `flattenHistoryData` | Fixes display defects | code |
| P4.4 | Recent five | ENSv2 only. | Five rows of the same stream; ENSv1 events included. | `routes/addr/$addr/index.tsx` | Improvement | code |
| P4.5 | Table states | "Loading timestamps" and "Error fetching timestamps". | Gone; dates are on the row. The sender states remain, because senders still come from receipts. | `AddressHistoryDataTable.tsx` | Improvement | code |

### 4.5 Record history

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P5.1 | Which resolvers' writes are shown | Current resolver only (ENSv1). | `history?type=record&include=data,raw&order=desc`, every resolver the name pointed at, capped at 1,000 rows. One exact key is filtered server-side with `record_key`. | `features/records/hooks/useRecordHistory.ts` | Improvement; silent cap | code |
| P5.2 | Per-key filtering | ENSv1 by key; ENSv2 by type only. | Key families (`coins`, `texts`, `contentHash`, `abi`) are filtered client-side. A `clearRecords` reset carries no key and appears in every record's history. The legacy double emit is collapsed. | `useRecordHistory.ts` | Improvement for ENSv2 | code |
| P5.3 | Date column | RPC, "Block N" fallback. | The row's `timestamp`. | `ForwardNameDetails.tsx` | Improvement | code |

### 4.6 Registry pages

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P6.1 | Header counts | `labelCount`, `roleCount`, `eventCount`. | `GET /v1/registries/{chain}/{addr}?include=counts`: `labels` and `roles` (declared assignments, so one account on two resources counts twice). `events` is fetched but no longer rendered. | `features/registry/hooks/useRegistry.ts` | Neutral | code; parity of `roles` with Panoptes is unverified |
| P6.2 | "Deployed" badge | Separate query with its own loading and error states. | `created_transaction_hash` from the overview: a tx badge with the date, the date alone, or a dash. | `routes/registry/$address/index.tsx` | Improvement | code |
| P6.3 | Registry tree "Labels: N" and "Created" | Count, first event tx, unused sample. | Overview fields. | `useRegistryLabelCount.ts` | Neutral | code |
| P6.4 | Labels table | First 100; a max-uint64 expiry threw. | One page of 100 with `include=counts`. Expiry from `servedExpiry`, so an ENSv1 label shows its lease; no finite expiry renders "Does not expire". An unknown label has `name: null`. | `useRegistryLabels.ts` | Fixes the crash | code |
| P6.5 | Subregistry slot: detached or never configured | `SubregistryUpdated` count. | `history?type=subregistry&page_size=50`; rows emitted by the ENSv1 registries are not links; zero links with more rows is unknown and renders as an error. | `useSubregistrySlot.ts` | Neutral | code |
| P6.6 | Registry history feed | `contractAddress` events with a total. | `GET /v1/events?contract_address=...&include=data,raw,total_count`, with its own exact total. | `fetchContractEventsPage` | Neutral | code |
| P6.7 | Detach impact copy | Two Panoptes totals. | Two `page_size=1` reads of `/labels` for `total_count`, one of them with `exclude_owner=<caller>`. A `null` total reads as unknown and the form says it could not check; a `404` registry counts as 0. | `useRegistryOccupants.ts` | Neutral; fails closed | code |

### 4.7 Resolver page

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P7.1 | Counter cards | `nodeCount`, `roleHolderCount`, client `linkCount`. | Four reads: the overview (`bound_names`, first 200), `/links` and `/roles` to 1,000 rows each, and the first 200 events. v0.4.1 serves no node total, so the card shows the first page's length with a "+" when more follow ("200+"). | `features/resolver/hooks/useResolverOverview.ts` | Regression for the node count | code; live (audit N10) |
| P7.2 | Recent events and "History (N)" | Unbounded `resolver.events`. | The first 200 events, newest first. The heading shows the served total, so it can exceed the rows on screen. | `useResolverOverview.ts` | Improvement; 200-row window | code |
| P7.3 | Nodes page and the create-link picker | Every node, with Active or Inactive by resolver equality. | A separate walk of `bound_names` to 2,000 rows, with "Showing the first N nodes." when truncated (not in the picker). Every row is Active; former nodes are not listed (TYR-240). A failed continuation page discards the pages already fetched, so for the public ENSv1 resolver the page shows nothing for minutes and then "Error fetching nodes. Please refresh the page." (B1). | `getResolverNodes`, `routes/resolver/$address/nodes.tsx` | Regression; fix in section 8 | code; live (audit B1) |
| P7.4 | Roles table | Bitmap rows. | `/roles` rows; `powers` re-encoded to the resolver role bitmap (20 powers; `set_pubkey`, `set_alias`, `clear_records` have no bit and are dropped); scope from `record_resource`. | `powersToResolverRoleBitmap` | Improvement | code |
| P7.5 | Links page | Client grouping. | `/links` rows grouped by `record_id`; default and unnamed rows left out. | `toLinkedName` | Improvement | code |

P7.6 (role history) moved to 4.12.

### 4.8 Forward and reverse resolution

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P8.1 | Which names are listed | ensjs `resolvedAddress` (coin 60 only). | `relation=resolves_to&coin_type=evm&sort=name`, full walk: coin 60, every ENSIP-11 EVM coin type and the ENSIP-19 default. Names set only for another EVM chain appear. Seven of the nine names `origin/main` listed for `0xbf3e48d8…` are missing; they look like registry-only subnames (TYR-228). | `useNamesForResolvedAddress.ts` | Mixed | code; live (session) |
| P8.2 | "Networks" column | Every coin type the resolver has, kept after a clear. | Every coin type in `records.seen_addresses` from one `POST /v1/lookup` (`profile=detail`) per 1,000 names, except cleared ones, plus the matched coin types; ascending; non-EVM types labelled by name. A name served without `records` shows only its matched types. | `toForwardNames` | Restored, except cleared records | code; live (session) |
| P8.3 | Sidebar record history | Current resolver only. | The `coins` family of the record history (4.5). | `ForwardNameDetails.tsx` | Improvement | code |

### 4.9 Recent activity (home page)

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P9.1 | Feed contents and wording | Panoptes `eventConnection(first 15)`, rows keyed by raw event name. | `GET /v1/events?order=desc&page_size=15&include=data,raw`, no type filter. Rows are worded by bigname type: "Registered by", "Name renewed", "Name released", "Expiry extended", "Ownership transferred to", "Resolver updated to", "Subregistry updated", "Fuses updated" or "Roles updated", "Resolver records cleared", record rows by key, "Primary name updated" with the name as a pill, "Migrated from ENSv1 to ENSv2" with the path as a pill. ENSv1 activity appears. Rows without a transaction are dropped. "Subname created by" and "Unwrapped from ENSv2" no longer exist. | `features/dashboard/hooks/useRecentActivity.ts`, `features/dashboard/utils/formatActivityEvent.ts` | Improvement | code; live (audit N6: 45 events, 0 throws) |
| P9.4 | Duplicate "Primary name updated" | n/a | Each primary-name set also yields a `record` row with `key: name` and no value, which reads "Primary name updated" without a pill. | `formatActivityEvent.ts` | Cosmetic; optional fix in section 8 | code |
| P9.3 | Refetch | 30 s. | 30 s while only the first page is loaded. | `useRecentActivity.ts` | Neutral | code |

### 4.10 Migration status ("Upgrade to ENSv2" prompts)

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P10.1 | Inputs to `classifyName` | Raw subgraph `V1Domain`. | `GET /v1/names/{name}` plus the parent. Migratable only when `authority` is `ens_v1` or `ens_v0` and the name is not `released`; a `404` (including a registry child) or `unsupported` is not migratable. Name detail carries no `restrictions`, so the wrapper expiry is always the derived one (M2.1). A name with a released ENSv2 registration gets no prompt even with a live ENSv1 lease. `unresolvable_reason` is not read here. | `features/migration/hooks/useMigrationStatus.ts` | Edge change | code |

`picarto.eth`, an ENSv1 `.eth` name with no BaseRegistrar lease, would be offered as migratable for an address that holds no registrar token (B4). The on-chain preflight should reject it.

### 4.11 Indexer sync after writes

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P11.1 | Post-write refresh | Wait 5 s, then five invalidations 3 s apart, whatever the indexer's state. | Poll `/v1/status` until `indexed_block` reaches the target, then invalidate once: first check after 1 s, then every 2 s, up to 30 checks (about 60 s), after which it invalidates anyway. No caller passes the receipt block, so the chain head at call time stands in. Awaited flows (records save, resolver links and roles) finish sooner when bigname is caught up and later when it lags. | `utils/query/pollForIndexerSync.ts` | Improvement; timing change | code |

### 4.12 Roles

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P12.1 | Name role history | RPC `getLogs` over `EACRolesChanged` for the name's versioned resource, plus block timestamps. | bigname `permission` rows: `GET /v1/events?registration_id=...&type=permission&order=asc`, up to 2,000 rows, for `grant_scope.kind: registry` rows emitted by the name's registry. The previous roles come from `added_powers` and `removed_powers`, else the account's previous row. No RPC. | `lib/roles/nameRoleChanges.ts`, `features/roles/hooks/useRoleHistory.ts` | Improvement; depends on indexing lag after a grant | code |
| P12.2 | Current name role holders and the roles counter | The same log scan, folded. | The same bigname rows folded to the latest set per account. Not `/v1/permissions`, by choice: stored roles, not read-time masks. Only the 20 mapped powers count. | `features/roles/hooks/useNameRoleAccounts.ts` | Improvement | code |
| P12.3 | Registry root role holders and per-account root history | RPC `getLogs` on the root resource. | Unchanged on v0.4.1, which does not serve root role changes: a cached probe selects the log scan there and bigname after the release (R4). Used by the registry roles table, the add and edit user sheets and the root-authority section of a name's roles page. | `lib/roles/rootRoleReads.ts`, `lib/roles/roleChangeLogs.ts`, `useRegistryRootRoleHolders.ts`, `useRegistryRoleHistoryForAccount.ts` | Neutral until R4 | code |

## 5. api-worker

Paths are relative to `workers/api-worker/src/`.

### 5.1 Migration gas faucet gate (`POST /wallet/fund`)

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| W1.1 | Host | The ENSv1 subgraph. | The network profile's `endpoints.bignameApi`, the same deployment as the apps. | `core/bigname/index.ts` | Improvement | code |
| W1.2 | Gate predicate | One `domains(first: 1)` existence query with reverse, expiry and husk exclusions. | `hasV1Names` walks `relation=any&authority=ens_v1,ens_v0&sort=expires_at`, descending, at most five pages of 200, and returns true at the first live row. If it stops on a lapsed row it walks once more ascending, where rows without an expiry sort first. A live row is not a reverse name, not `released` or `unregistered`, and its lease (`ens_v1.expires_at ?? expires_at`) is absent or in the future. Any error throws and the caller skips the drip. | `services/v1-names/index.ts` | Neutral | code; live (audit N5: six addresses) |
| W1.3 | `ens_v0` | n/a | Counted as migratable ENSv1. | same | Neutral | code |

When the descending walk hits the five-page cap it reports "exhausted" and skips the ascending walk, so an address whose first 1,000 rows hold no live name gets no drip (B4, section 8).

### 5.2 Expiry reminder discovery (hourly cron)

The sweep was rewritten for v0.4.1. Each run makes one freshness probe (`GET /v1/names?...&page_size=1`, read for `meta.as_of`) and then sweeps four tracks, each with its own stage cursors.

| Track | Reads | Own expiry | Served `expires_at` sits | Grace | Stages |
| --- | --- | --- | --- | --- | --- |
| `ens_v2` | `parent=eth&authority=ens_v2` | `expires_at` | at the expiry | 28 days | 7 |
| `ens_v1_lease` | `parent=eth&authority=ens_v1,ens_v0` | `ens_v1.expires_at` | at the lease | 90 days | 7 |
| `ens_v1_reserved` | the same rows | `ens_v1.expires_at` | 62 days after the lease | 90 days | 7 |
| `subname` | every name, no parent or authority filter; `.eth` second-level rows dropped client-side | `expires_at` | at the expiry | none | 4 |

The seven registration stages are 30, 7 and 1 days before expiry, grace start, 7 and 1 days before grace ends, and premium start. The four subname stages are 30, 7 and 1 days before expiry and a new `expired` stage.

| # | Difference | Before | Now | Where | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| W2.11 | Requests per run | 7 GraphQL queries of up to 1,000 rows. | 1 probe plus 25 stage windows: 26 requests when every window fits one 200-row page. A window reads up to 1,000 rows (5 pages). | `services/expiry-discovery/index.ts`, `indexer.ts` | More requests (TYR-234) | code |
| W2.12 | "Now" | The wall clock. | `min(wall clock, publication time)`, so a row is judged only once the indexed state has reached its phase. | `fetchPublicationTime` | Improvement | code; live (audit) |
| W2.13 | Cursors and paging | A KV timestamp per stage. | A KV expiry timestamp per track and stage; within a run the walk follows bigname's cursor. A page boundary inside one timestamp triggers an exact-second query capped at 5,000 rows, with an overflow alert. Cursors stored before tracks existed carry over to `ens_v2` and `ens_v1_lease`; the other two start from defaults. | `cursors.ts`, `page.ts`, `overflow-alert.ts` | Improvement | code |
| W2.14 | ENSv1 timing | Every row got the ENSv2 28-day grace stages. | ENSv1 stages key off the lease with the 90-day grace. A reserved lease is found by the 62-day shift (X7) and placed by its lease date. | `stages.ts` | Fixes wrong ENSv1 notices | code; live (audit N5: `robotico.eth`) |
| W2.15 | Who is notified, by status | Every row at every stage. | Before expiry, held rows only. In grace, held rows (ENSv1) and rows released as `expired` (ENSv2). After grace, only rows released as `expired`. A row released for another cause, or `unregistered`, is never notified. | `isNotifiableAtStage` | Improvement | code |
| W2.16 | Recipient | `owner.id`. | `owner ?? lapsed_registration.owner`, so the last holder of a released name is reached. | `toExpiringDomain` | Improvement | code; live (audit N8: 16 of 16 with an owner) |
| W2.17 | Subnames | Sent all seven stages with ENSv2 grace wording and a Renew link the manager's `/renew` rejects for subnames. | Holders (and favourites from 7 days) get pre-expiry and expired notices that name the parent's owner as the one who can extend the name and link to the profile, with no Renew or Register action, in email, push, Telegram and the manager inbox. | `services/delivery/templates/name-expiry.ts` | Improvement | code |
| W2.18 | Rows that fit no track | n/a | A `.eth` row whose dates fit neither ENSv1 track is logged ("fit no expiry track") and skipped. | `fetchExpiringNamesPage` | Safety net | code; live (audit C1: 1 such row) |
| W2.19 | Failures | Own retry loop. | The client retries `409 stale` in place (three retries); a walk restart is only the fallback. A failed stage does not move its cursor; other stages commit. | `packages/bigname/src/request.ts`, `index.ts` | Neutral | code |
| W2.20 | Idempotency | `name-expiry:{user}:{name}:{stage}:{expiryDate}`. | The same key. `expiryDate` is the name's own expiry (the lease for ENSv1). | `queues/event-ingestion.ts` | Neutral | code |

Live observations on subnames (session): an expired wrapped ENSv1 subname stays `wrapped` with no `lapsed_registration`, and some have no `owner`, so only favourites are notified. Expired ENSv2 subnames could not be checked, because none exist on Sepolia.

## 6. Merged on bigname `main`, pending a release

These changes are on bigname `main` at `4a89b2d21` and are not deployed. Everything here is `docs` confidence at most: it comes from `git diff v0.4.1..origin/main` on bigname's API docs and from `packages/bigname/README.md`, section "After v0.4.1". The client already types every shape (`a3f750d5a`, fixtures in `packages/bigname/src/postV041.mock.ts`): each new response field is optional, and no new request parameter is sent unless a caller passes it. v0.4.1 answers the new parameters with `400 invalid_input`, which the client can detect (`isUnknownQueryParamError`, `isUnsupportedIncludeError`).

`origin/next` adds no response field or parameter beyond `main`; its API docs are behind `main`.

R1 to R4 are adopted on the branch with a fallback for v0.4.1. The new-release paths are tested only against fixtures written from bigname's docs (`postV041.mock.ts`); the v0.4.1 paths were re-run against the live deployment.

| # | bigname change | On v0.4.1 today | Once deployed | Branch handling | Status |
| --- | --- | --- | --- | --- | --- |
| R1 | `ens_v1.wrapper_expires_at` on every name-shaped row: the NameWrapper entry's own expiry (TYR-231, #1074 `4a89b2d21`). | The wrapper expiry is served only on `restrictions`. The portal migration status and the manager's 422 fallback derive lease + 90 days, which `allara.eth` contradicts (M2.1, P10.1). | Migration classification reads the wrapper's real expiry everywhere, including for names renewed through a controller that skipped the wrapper. | Adopted (`f375c25ca`). `packages/migration/src/service/v1Domain.ts` reads the expiry from `ens_v1.wrapper_expires_at` (`readWrapperExpiry`), then from address-row `restrictions`, then from the lease + 90 days derivation. `no_expiry` is max uint64 and `not_set` is 0; a served expiry with no `wrapper_state` is a lapsed entry. `hasExpiredDotEthRegistration` (`classifyNames.ts`) now also applies the wrapper window to a name whose lease is live, so a wrapped `.eth` name whose wrapper entry trails its lease is `expired-registration` once `wrapper expiry − 90 d` has passed. This already changes one live v0.4.1 result, because the manager reads the exact value from `restrictions` there: `allara.eth` goes from `unlocked` to `expired-registration` (live, session; `NameWrapper.getData` returns `1796210736`). The manager walk (`v1Names.ts`) runs without `include` first and repeats with `include=role_summary` only when a listed row is wrapped and no row serves the field, so on v0.4.1 an address with a wrapped ENSv1 name makes two walks instead of one. A row with `wrapper_state` and no served expiry is still treated as wrapped and derived on both versions. | Adopted; `docs` for the new-release path |
| R2 | Address-names `page.total_count` is `null` above 1,000 candidate names unless `include=total_count` is sent (#1077 `ebe6fc54e`). v0.4.1 rejects that include. | The total is always exact. | The old `total_count ?? 0` would have turned the manager's owned count (M4.1) and migrated count (M2.4) into 0 for an address with more than 1,000 candidate names. | Adopted (`f375c25ca`). `getAddressNamesCount` (`apps/manager/src/features/shared/service/addressNamesCount.ts`) reads one row; a `null` total on an empty last page is 0, otherwise it re-requests the first page with `include=total_count`. The flag is never sent first, so v0.4.1 requests are unchanged (live, session). The re-request gives `null` on a 408, on a 10-second client deadline or on the v0.4.1 include rejection; `null` means "at least one, number unknown". The owned count (M4.1) then skips auto primary-name setup, and the migrated count (M2.4) hides the progress banner, shows no first-visit modal and counts as one migration for the NFT gate. No other address-names read uses `total_count`: the portal heading is the walked length, and `hasOwnedNames` and the faucet gate read rows. | Adopted; `docs` for the new-release path |
| R3 | History `data` gains `token_id`, `canonical_id`, `cost`, `base_cost`, `premium`, `payment_token`, `referrer` and `operator` (TYR-238, TYR-239, #1084 `9f3961522`). | None of them is served; the portal derives ENSv1 token ids and shows none for ENSv2 (P3.3). | The timeline can show the ENSv2 token id at each event, cost, referrer, operator and canonical id again. Until the branch types the fields for display, served values would appear in the decoded table untyped. | Adopted (`cf8f7781b`). A served `data.token_id` wins over the ENSv1 derivation (`historyTokenId.ts`). The decoded table shows `cost`, `base_cost`, `premium`, renewal `cost`, `payment_token`, `referrer`, `operator` and `canonical_id` where served, which is where `origin/main` showed them; nothing is added to headlines. Amounts (`utils/history/historyPayment.ts`): ETH for a row with no `payment_token`, `canonical_id` or `token_id` (an inference, since no flag says ENSv1); token decimals and symbol for USDC and DAI (`lib/tokens.ts`); raw units with the token address otherwise. A charge repeated on the `registered` and `linked` rows of one `action_id` is kept on one row. Against v0.4.1 the output is byte-identical to before over 764 live rows (live, session). Still not served, so still missing against `origin/main`: `sender` on registration, resolver and subregistry rows, the raw role bitmaps, and the ERC-1155 transfer `value`. | Adopted; `docs` for the new-release path |
| R4 | Registry root roles: holders on `GET /v1/permissions?registry=`, and `RootPermissionChanged` `permission` rows in the event feed, registry history and address history (TYR-229, #1075 `9fd3ef8ef`, #1073 `83d192002`). | Root roles are read with an RPC log scan of 7 to 20 seconds (P12.3). | The registry roles table and root history can read bigname. Root role changes also start to appear, without a name, in recent activity (as "Roles updated"), in a registry's history feed and its event count, and in address history. | Adopted (`a19edbb2b`, `cf8f7781b`). One cached probe, `GET /v1/permissions?registry=<.eth registry>&page_size=1` (`lib/roles/rootRoleReads.ts`), decides the path: a 200 selects bigname, the v0.4.1 `unknown query parameter: registry` 400 selects the on-chain log scan, and any other error stays an error. History is gated on the same probe, because v0.4.1 answers `kind=RootPermissionChanged` with `400 kind is invalid`. On bigname, holders are one paged permissions read and an account's root history is `contract_address=<registry>&address=<account>&kind=RootPermissionChanged`, with before-sets from `powers − added_powers + removed_powers` and no `getLogs` or block-time calls. Powers map through `registryPowersToRoles`; `can_name` and `admin_can_name` have no ensjs role and are dropped, as the scan drops those bits. A `partial` response adds a muted line under the roles table: "Roles held through an operator approval aren't listed here." On v0.4.1 the scan's holders and history are identical to before (live, session), at the cost of one extra 400 per tab every 5 minutes. The feeds render root rows as "Root roles updated" (recent activity) and "granted/revoked/set root roles … on {registry}" (timeline). A root grant made by someone else can land under "Names assigned to this address" in address history, because name-less rows share one group there. The log scan stays as the fallback and can be removed once the release is deployed everywhere. | Adopted; `docs` for the new-release path |
| R5 | ENSv2 `token_id` on name detail and lookup is the versioned ERC-1155 token (TYR-237, #1079 `1fd6712c1`). | Served as the bare labelhash: `envoy1084.eth` ends `…26440146fa` (live, spot), and `ownerOf` of that value is the zero address. | The served value matches the registry's `getTokenId`. | No app reads name-detail `token_id`, so nothing changes on screen. | No action |
| R6 | `restrictions.locked_roles` counts registry-root admins (TYR-232, #1076 `664b39070`). | Root admins are not counted. | More accurate `locked_roles`. | No app reads `locked_roles`. | No action |

Known gap in R1: a receiver that unwraps inside the mint callback is still recorded as wrapped. An adapter fix comes in a later hash-rotating release.

## 7. Open bigname gaps

Ticket states were read from Linear on 2026-10-05.

| Ticket | Gap | State | Affects |
| --- | --- | --- | --- |
| TYR-228 (High) | Name rows for registry-only children. The full fix is adopted: a real name identity, unknown labels as `[hash]`, nested children, `/subnames`, counts and search. It changes the interpreter hash, so it ships in the next rotating release, not a v0.4.x. | In progress on `next` (PR 1 of 4) | Migration registry-child candidates (M2.2), subnames tables (P2.8), address lists (X15), resolution page (P8.1) |
| TYR-236 (High) | ENSv2 registry operator approvals are not projected. Until they are, every discovered registry's permission list reports `completeness=partial` with `ens_v2_registry_operators`. | In progress; groundwork on `next` (#1083); rotating release | Role tables (P12.2, R4) |
| TYR-240 (Low) | Names that formerly pointed at a resolver. | Backlog | Resolver Nodes "Inactive" rows (P7.3) |
| TYR-234 (Low) | Several expiry windows in one `/v1/names` call, and a larger page cap. Linked behind TYR-230. | In progress (#1089 open) | Sweep request count (W2.11) |
| TYR-230 (High) | `/v1/names` gathers rows without a cap and runs slow on large namespaces. | In progress | Sweep latency (5.2) |
| TYR-235 (Urgent) | Address history loads every event before paging; a heavy address times out or kills the API. | In progress | Portal address history (P4.1) |
| TYR-233 (Low, docs) | What each `registration_status` means per authority, including `registered` on ENSv1 rows (lease held, registry record not reclaimed). | Backlog | Every status filter (M1.3, P1.5) |
| TYR-229, TYR-231, TYR-232, TYR-237, TYR-238, TYR-239 | See section 6. | Done on `main`, not deployed | Section 6 |

Earlier tickets, as reported by the working session and not re-read in Linear: TYR-189 canceled; TYR-192, TYR-196 and TYR-199 done.

Never raised with bigname:

- A "subnames only" filter on `/v1/names`. The subname track reads every name in its window and discards the `.eth` second-level rows (W2.11).
- The contradiction in bigname's docs on whether a name in grace lists under `owner` (B3). `api-v1.md` says a `.eth` name inside its registrar grace still lists under `relation=owner`; the expiry-sweep guide and the `release_kind` text say an ENSv2 registration is released at expiry.
- Resolver `bound_names`: `total_count` is `null`, and continuation pages timed out (B1).
- "Unwrapped from ENSv2" rows, which have no bigname equivalent (P3.10, P9.1).

## 8. Fixes on our side still to do

Decided, not yet done. None is on the branch.

| # | Fix | Why |
| --- | --- | --- |
| F1 | Resolver Nodes: keep the pages already fetched when a later page fails, and show the truncation notice (B1). | The page for the public ENSv1 resolver shows nothing, then an error (P7.3). |
| F2 | Retry `409 conflict` when the request sent no `at` (B2). | bigname documents it as retryable. Lookup is on the migration path, where a transient conflict fails the read. |
| F3 | Read `relation=former_owner` as well, and show ENSv2 names inside their 28-day grace as renewable on the manager dashboard and the portal address list; correct the comment in the portal's `addressNames.ts` (B3). | An ENSv2 name in grace drops off both lists (M1.3, M6.1, P1.5). First observable about 2026-10-30. |
| F4 | `role_summary` answers `422` above 1,000 grants: retry with a smaller page before the fallback walk. | The fallback loses `role_summary` and `restrictions` for the whole list (3.1, 3.2). |
| F5 | Show names with `unresolvable_reason: no_live_ens_v2_entry` as "not reserved for ENSv2" upfront. | Such a name cannot migrate: the preflight `checkPremigrationReservation` requires the ENSv2 entry to be reserved. Today the user finds out at preflight (X16). |
| F6 | Reword the worker's 62-day comments as an invariant. | The code comments describe a shift that could split; the migration design rules that out (X7). |
| F7 | Do not offer a lease-less ENSv1 `.eth` name as migratable (`picarto.eth`). | B4, P10.1. |
| F8 | Treat a capped faucet walk as "stopped", so the ascending walk still runs. | B4, W1.2. |
| F9 | Delete `profileOwnedNamesQuery`, which has no importer, and the unused `registeredAt` field on the manager's profile names. | Dead code (B4). |
| F10 | Optional: drop the pill-less duplicate "Primary name updated" row. | P9.4. |

## 9. Accepted differences

These are known and will stay unless a reviewer overrules them.

- **Reminders.** NameWrapper-only expiries and max-value expiries get no reminder. A row that fits no ENSv1 track is skipped. An expired wrapped ENSv1 subname with no owner notifies favourites only.
- **"Does not expire" for the 465 saturated leases.** The served value no longer carries the lease's own expiry.
- **Owned-subname search suggestions.** A subname of an owned name is suggested only when the address also holds or manages it (P1.8).
- **Networks column.** Cleared address records are excluded (P8.2).
- **Explorer detail on ENSv2 history rows** until R3 deploys and is adopted (P3.3).
- **Resolver Nodes** shows no "Inactive" rows until TYR-240 (P7.3).
- **Registry children** are unlinked in the portal and hidden in the manager until TYR-228 (X15).
- **Silent caps** in X8.
- **`unsupported`** is not rendered as its own state (X3).
- **Primary-name dialog** lists ENSv2 names only (M5.1).

## 10. Decisions this branch made

Each is a judgement call a reviewer may want to overrule.

1. `ens_v0` is ENSv1 everywhere.
2. Released and unregistered rows: the manager drops both on the dashboard, profile list, primary dialog and landing check; the migration list drops released rows and registry children; the portal drops released ENSv1 rows and lists registry children unlinked; the faucet drops both; the reminder sweep keeps them and decides per stage.
3. The manager computes grace itself (90 and 28 days) and does not read `grace_ends_at`; the portal and the worker read it.
4. The primary-name dialog is restricted to `relation=owner&authority=ens_v2`, first 100 by name.
5. The dashboard's primary check mark still comes from reverse resolution and is ENSv2-only.
6. A failed `hasOwnedNames` read in `beforeLoad` keeps the user on the landing page.
7. `unsupported` name detail counts as "held" in search and falls through to the chain on the profile.
8. The manager's ENSv1 registration date has no chain fallback, and the ENSv1 `.eth` expiry on the name profile comes from bigname, not the chain.
9. Migration adapter: the wrapper expiry is the served `restrictions` value, else derived; `wrapped` without wrapper fields is an expired wrapper; the registry owner of a `.eth` second-level name is `manager ?? owner`; `registrant` is synthesized from `owner` for unwrapped names; no `/v1/permissions` read.
10. The ABI fallback probes content types 1, 2, 4 and 8 when `seen_abis` is omitted.
11. The migrated-names count uses `is_migrated=true` (proven migrations only).
12. Portal resolve-only names are re-added with a second walk; a failure of that walk fails the list.
13. Portal "N Roles" folds registry powers into the ensjs bitmap; an empty `role_summary` shows no badge.
14. The portal subnames table drops ownerless, escaped, non-normalized and hash-mismatched rows; the count card includes them.
15. Rows without a transaction are dropped from address history, record history and recent activity; the name timeline keeps them as their own action.
16. Child registrations are requested only for the unfaceted full history.
17. Name role holders are folded from `permission` history rather than read from `/v1/permissions`; registry root roles stay on RPC logs until R4.
18. The subregistry slot ignores rows emitted by the ENSv1 registries.
19. The sweep's "now" is the publication time; there is no `/v1/status` gate.
20. `namespace=ens` is passed on some reads and not others (X11).
21. `pollForIndexerSync` waits on `/v1/status` with a bound of about 60 seconds, and callers do not pass the receipt block.
22. `historyEventsToSubgraphEvents` is kept as an adapter for `NameSubgraphHistory` and the TLD route.

## 11. Not yet verified

- **ENSv2 names in grace (B3).** That a lapsed ENSv2 registration is `released` and outside `relation=any` is docs only. First observable about 2026-10-30 (`fox.eth`, `mrfreshy.eth`, `testingfox.eth`).
- **Expired ENSv2 subnames.** None exist on Sepolia. The worker assumes they are released as `expired` (5.2).
- **Everything in section 6.** Not deployed anywhere. To re-check once the release is on Sepolia:
  - that name detail, lookup `profile=detail` and address rows all serve `ens_v1.wrapper_expires_at`, and that a lapsed wrapper omits `owner` (R1);
  - that a `null` total on an empty last page means zero, that `include=total_count` is accepted with `parent=eth&dedupe=registration` and with `is_migrated=true`, and whether the 10-second deadline suits large addresses (R2);
  - that the Sepolia ENSv2 payment token is one `lib/tokens.ts` knows, that no ENSv2 row serves an amount without `payment_token`, and that the `registered` and `linked` copies of a charge are identical (R3);
  - that real `registry=` responses match the fixtures, that `added_powers` and `removed_powers` are always present, and that bigname's holders equal the log scan's on a live registry (R4).
- **X5.** The contract statement on the retired overlap refusal was not re-read against v0.4.1.
- **X10.** The 12-second cache header on name detail.
- **X12.** That `[labelhash].eth` names lack `registered_at` is from the session, not re-observed. The mainnet profile's behaviour is docs only.
- **X13.** Stored zero address as absence was not re-read against v0.4.1.
- **`unsupported` names.** None was exercised live (X3).
- **M2.3.** Whether any live row is `wrapped` without wrapper fields.
- **M2.4.** Parity of the migrated count with Panoptes.
- **P6.1.** Parity of `counts.roles` with Panoptes `roleCount`.
- **P7.4.** Whether a `/roles` row's `powers` is the set after the grant or the delta.
- **P8.1.** That the seven names missing for `0xbf3e48d8…` are registry-only subnames is an inference.
- **P11.1.** How far `indexed_block` trails the head in normal operation, and whether the head-block stand-in can target a block past the write's own.
- **"Before" columns.** Checked on `origin/main` only for the expiry hooks, role hooks, search, the dashboard reads, the migrated count, registry occupants, the sync poll, the faucet and the sweep. The rest are carried over from the earlier doc.
- **e2e.** The suite was not run against the v0.4.1 mock (X1).
- **The assumption that "`unregistered` and no `created_at`" means no name row** held in every sample (C2) but is not a contract promise.
- **A missing `resolver` means "no resolver".** It means "withheld" when `unresolvable_reason` is set. In three spot checks the chain also had none (audit), but the contract does not promise that.

## 12. Retired rows

Row ids are stable. These rows from the earlier version are retired rather than renumbered.

| Row | Why |
| --- | --- |
| X14 (ownerless ENSv2 reservation resolver) | Described a pre-cutover build. Replaced by X16 on `unresolvable_reason`. |
| M3.2 ("Registered" line for an ENSv1 primary) | The address profile header renders no such line; the field is set and never read (F9). |
| M3.9 (reserved-but-unmigrated resolver) | Covered by X16. |
| M6.3 (notification payload dates) | Timestamps are seconds everywhere (X2). |
| P2.7 (records count and ABI) | No difference; folded into P2.6. |
| P4.6 (network column) | Never a difference. |
| P9.2 (unused total) | Never a difference. |
| P5.4 (stored zero address) | Covered by X13. |
| P7.6 (role history on RPC) | Wrong since the v0.4.1 move; replaced by 4.12. |
| P8.4 (reverse sidebar) | No difference beyond P5. |
| P10.2 ("Reserved on ENS v2" copy) | Never a difference. |
| W2.1 to W2.7 | Section 5.2 was rewritten for v0.4.1. The new rows are W2.11 to W2.20. |
| Old section 7 items 2, 3, 5, 6, 7, 10, 13, 14 | Resolved in v0.4.1 or on `main`: lapsed owners (`lapsed_registration.owner`), `nick.eth` wrapper fields, timestamp spelling, the 1970 wrapper expiry, the single-value `authority` filter, migration and primary-name rows, the older Sepolia build, history token ids (R3, R5). |
| Old section 8 (fixture checks) | Answered by the live audit, or moved to section 11. |
