# What changes on screen and in data when the ENS apps move to bigname

Date: 2026-09-28. Apps worktree: `claude/bigname-rest` at `cd994f236` plus the uncommitted migration (five implementation slices: manager, migration, portal names, portal history, api-worker) and a cleanup pass (portal leftovers, `packages/indexer` removal, e2e mock). bigname contract: the docs exported from `ensdomains/bigname` `main` at `54eb98b07` (`api-v1.md`, `api-v1-routes.md`, `upstream.md`, `consumer-capabilities.md`, `glossary.md`), which include #935 to #962. Live checks were run against `https://sepolia.api.bigname.sh` (read-only) on 2026-09-28, when it was `ready` but ran a build older than `main` (X10).

Audience: reviewers of the bigname REST switch and the apps team. Scope: every difference a user can see on a screen, or a consumer can see in data, between what the apps read at `origin/main` from the ENSv1 subgraph (ENSNode) and the Panoptes GraphQL indexer, and what the migrated code reads from bigname's `/v1` REST API. It does not cover transport or client-package design; see `packages/bigname/README.md` for the client.

How to read the tables. Each row says what the screen showed before, what the migrated code does, why (a bigname document section and the file that does it), the impact, and a confidence mark: **code** (verified in the migrated worktree; the cited path is the new code), **docs** (verified in the bigname contract only), **live** (observed on the Sepolia deployment), **fixture** (needs a Sepolia fixture check before shipping). Section 6 lists the judgement calls a reviewer may want to overrule, section 7 the candidates for a bigname change, section 8 the fixture checks.

## 1. Summary

| Screen | Difference | Impact |
| --- | --- | --- |
| Every screen | RFC 3339 timestamps; history rows carry timestamps, so every `getBlock` back-fill and "Block N" fallback is deleted (X2). | Improvement |
| Every screen | Missing data is a status, not `null`. The apps treat `status=unsupported` as "known" (search) or fall through to the chain (profile owner); no screen renders an "unavailable" state (X3). | Regression risk, small |
| Every list | Page size 200, cursor walks with `409 stale` restarts inside `fetchAllPages`; caps of 1,000 to 10,000 rows per walk (X8). | Neutral |
| Every v1/v2 badge | `authority` with `ens_v0` treated as v1 everywhere (X4). | Neutral |
| Names with both eras | Overlap refusal retired; a released ENSv2 registration keeps the name with ENSv2, which hides the migration prompt for it (X5, P10.1). | Improvement; one edge change |
| Every expiry | Bare lease expiry, omitted for none or out of range; "Does not expire" keys on absence; no 90-day shift for v1 dates (X7). | Improvement |
| Manager dashboard | One `relation=any` walk per connected address, merged by namehash; released and unregistered rows dropped in both eras; v2 names the address only manages now appear; Manager chip from `relations` plus ENSv2 grants; sort, search and "Created" stay client-side; the primary check mark stays v2-only (3.1). | Mixed |
| Manager migration | Two `authority` walks plus one lookup batch feed a `V1Domain` adapter; registry-only `setSubnodeOwner` subnames are absent by bigname design, so the "registry-child" copy route loses candidates; wrapper expiry derived from `expires_at`; `abi_content_types: null` probes types 1/2/4/8; "N names upgraded" counts proven migrations only (3.2). | Regression for registry-only subnames |
| Manager profile | `registered_at` from name detail for every name; a v1 name without one shows no date (the subgraph plus `getBlock` fallback is gone); record keys union `known_keys` and `unsupported_keys`; the v1 primary "Registered" line gains a date (3.3). | Improvement with one gap |
| Manager pricing / landing / search | Registrant count includes v1 leases; landing redirects v1-only owners and stays on landing when bigname fails; search reads `registration_status` (3.4). | Neutral |
| Manager primary-name dialog | `relation=owner&authority=ens_v2`, first 100 by name, `is_primary` first; v1 names stay out (3.5). | Product decision recorded |
| Manager grace banners | Same computation over the merged list; still waits for the full walk (3.6). | Neutral |
| Portal address names | Resolve-only names (coin 60) read with a second `relation=resolves_to` walk and kept under "Names assigned to this address"; released ENSv1 rows dropped, released ENSv2 rows kept; "N Roles" counts registry powers folded to the ensjs bitmap; v1 rows gain counts and exact totals; owned-subname suggestions in search come from a capped per-name fan-out (4.1). | Mixed |
| Portal profile | v1 "Registered" gains a tx link; subname count exact and includes placeholder children; placeholder and ownerless subname rows dropped from the table (4.2). | Improvement with rendering rules |
| Portal history timeline | Eleven chips; raw `kind` as the row badge; new `release`, `expiry`, `authority` rows; `cost`, `tokenId`, `sender`, `operator` gone; wording changes; child registrations via `include=child_registrations` on the full history only (4.3). | Improvement for coverage, regression for explorer detail |
| Portal address history | One stream, wrapped v1 names included, rows without a transaction dropped, capped at 1,000 rows (4.4). | Improvement |
| Portal record history | All resolvers the name used; `clearRecords` rows in every record's history; legacy double emit deduped; capped at 1,000 rows (4.5). | Improvement |
| Portal registry pages | `counts.roles` counts assignments; `createdTransactionHash` nullable; occupant check reads up to 2,000 labels and fails closed; subregistry slot ignores ENSv1 `NewOwner` rows (4.6). | Mixed |
| Portal resolver page | Four reads; nodes always active; first 200 events with `eventCount` as the total; role bitmap rebuilt from `powers` (4.7). | Neutral once the newer build deploys |
| Portal resolution page | `resolves_to&coin_type=evm` lists names resolving on any EVM coin type (the subgraph searched coin 60 only); "Networks" lists every address-record coin type from one lookup batch, cleared records excluded; registry-only subnames absent (4.8). | Improvement; registry-only subnames lost |
| Portal recent activity | ENSv1 activity appears; rows worded by bigname type and kind (`release` and `subregistry` gain text); since v0.4.1 the migration row and the `primary_name` value pill are back (4.9). | Mixed |
| Portal sync polling | `pollForIndexerSync` waits on `/v1/status` `indexed_block` reaching the write's block, then invalidates once; sooner when bigname is caught up, up to ~60 s when it lags (4.11). | Improvement; timing change |
| api-worker faucet gate | `authority=ens_v1` then `ens_v0`, live rows only, fail-closed (5.1). | Neutral |
| api-worker expiry reminders | 200-row pages, stage-by-status rule, released ENSv2 rows carry no owner so their grace notices reach favourites only, wrapper-only and max expiries excluded (5.2). | Regression for lapsed ENSv2 owners |

## 2. Cross-cutting differences (apply to every screen)

### X1. One source instead of two, and the merges disappear

Before: the manager read the ENSv1 subgraph and Panoptes and merged in the browser (`mergedNames.ts`, deleted); the portal did the same through ensjs `subgraph` actions and `lib/indexer.ts` (deleted); the api-worker read a third host.

Now: one host per network, resolved by `@ens-apps/config` (`endpoints.bignameApi`, `https://sepolia.api.bigname.sh` on Sepolia; the apps can override it with `VITE_BIGNAME_API_URL`), one client (`packages/bigname`), one envelope. `packages/indexer` is deleted, along with `@urql`, the GraphQL codegen and the `indexerGraphql` endpoint; the chain and RPC config it carried lives in `packages/config` (`@ens-apps/config`). The CSP allowlists the bigname origin instead of the subgraph hosts (`apps/manager/src/server/csp.ts`, `apps/portal/src/worker/csp.ts`). The e2e stack runs no indexer any more: Panoptes is gone from `e2e/infra/docker-compose.yml` and the CI workflows, and with `E2E_MOCK_BIGNAME=true` (set in `e2e/.env.ci`) the Playwright fixtures serve bigname's `/v1` routes from a route mock (`e2e/helpers/mock-bigname.ts`); browser requests only, so SSR reads still reach the real deployment. Confidence: code.

### X2. Timestamps: RFC 3339 strings, no block-timestamp RPC

Every timestamp arrives as RFC 3339 and is parsed by `packages/bigname/src/time.ts` (`parseTimestamp`, `timestampToSeconds`), which accepts `Z`, a numeric offset and more than three fractional digits. The live deployment serialises `registered_at`/`created_at` with `+00:00` and `expires_at`/event `timestamp` with `Z`; the client does not string-compare. The `useBlockTimestamps` hook, `enrichEventsWithMetadata`, `useV2NameHistory`, `transformV2Events`, `decodeRawData` and the manager's v1 `getBlock` are deleted; `getBlockTimestamps` (`apps/portal/src/features/profile/hooks/useBlockTimestamps.ts`) stays only for the RPC role history (`lib/roles/roleChangeLogs.ts`, P7.6). Every history table renders dates from the row. Confidence: code, live.

### X3. Missing values are statuses, not nulls

The contract: single-resource misses are `404`, known-empty collections are `200 []`, and a name bigname cannot vouch for is `status=unsupported`. The client maps `404` to `null` (`nullOnNotFound` in `packages/bigname/src/client.ts`). What the migrated code does with `unsupported`:

- Manager search: an `unsupported` body counts as `held` ("bigname knows the name exists"), so the search box says "Registered" (`apps/manager/src/features/search/nameIndexStatus.ts`).
- Manager profile owner: `isNameProfile` is false, so the read falls through to the ENSv1 chain read (`apps/manager/src/features/profile/service/profileOwner.ts`).
- Migration list and profile replay: rows left out (`v1Names.ts`, `v1ProfileKeys.ts`), which for the replay raises `ProfileFetchError{phase:'indexer'}` as a missing node did before.
- Records inventory: an `unsupported` inventory contributes its `unsupported_keys` to the key set (M3.8, P2.6).

No screen renders a distinct "unavailable" state. Impact: small regression in honesty for `ensv2_exact_name_profile_shadow`-style names. Confidence: code.

### X4. `authority` replaces `protocol` and `isMigrated`

`ens_v0` is treated as v1 everywhere it is switched on: `protocolForAuthority` (`apps/manager/src/features/dashboard/dashboardNames.ts`), the migration walk (`v1Names.ts` walks `ens_v1` and `ens_v0`; the filter takes one value), the portal address list (`authority === 'ens_v2'` else ENSv1, `apps/portal/src/utils/names/addressNames.ts`), `useMigrationStatus.ts` and the faucet (`workers/api-worker/src/services/v1-names/index.ts`). `is_migrated=true` drives the migrated-names count and means a proven ENSv1 to ENSv2 transition only (M2.3). Confidence: code.

### X5. Overlap refusal retired; released ENSv2 keeps the name

Since #944/#953 a current ENSv2 registration wins without proof and a released ENSv2 registration keeps the name with ENSv2. The portal's migration prompt reads `authority` and hides for such a name even while an ENSv1 lease is live (P10.1). The retired reason codes are no longer produced; `unsupported` remains for other reasons (X3). Confidence: docs, code.

### X6. Relations: `owner`, `manager`, `registrant`, and what `relations` on a row means

`owner` is the token holder (for a wrapped name the NameWrapper holder, never the contract), `manager` the effective controller, `registrant` the registrar token holder. `relations` lists the relations that matched the request filter (live), so every chip-driving read in the apps uses `relation=any`: manager dashboard and profile (`getAllAddressNames`), portal address list (`useAddressNames.ts`), portal address history's held-name set (`useAddressHistory.ts`). Released ENSv1 names are not related to the lapsed holder (api-v1.md, Lapsed registration); released ENSv2 rows do appear (the portal keeps them, P1.5). Role-only ENSv2 holders remain unverified (fixture 1); the migrated code takes the Manager chip from `relations` plus `role_summary` grants and does not read `/v1/permissions`. Confidence: docs, live, code.

### X7. Expiry: bare lease expiry, omitted for none or out of range

`expires_at` is the bare registrar lease expiry (or the NameWrapper entry expiry for a wrapped subname), omitted for none, `type(uint64).max` and any out-of-range value. Both apps key "Does not expire" on absence (`addressNameExpirySeconds` returns `0` for a held row without one; portal `expiryDate: null`). The grace maths (90 d v1, 28 d v2 in `packages/utils/src/gracePeriod.ts`, unchanged) runs on the bare value.

The earlier claim that Panoptes folded the 90-day grace into v1 `expiryDate` was not borne out: the manager's v1 rows came from the subgraph's bare `registration.expiryDate`, and the worker slice read the Panoptes schema as carrying a separate `gracePeriodEnd`. No 90-day shift is expected on any screen or reminder; the residual question is only whether Panoptes ever served v1 names as v2 rows with a grace-inclusive value (fixture 4).

Released ENSv1 names keep their lapsed `expires_at` on name detail and on the `GET /v1/names` sweep, with `lapsed_registration` on detail only. The manager drops released and unregistered rows, the portal drops released ENSv1 rows, the sweep keeps them (5.2). Wrapped subnames whose parent set no expiry have no `expires_at`; the migration adapter reads that as wrapper expiry `0` (M2.1c). Confidence: code.

### X8. Page size 200, cursor walks, caps

`fetchAllPages` and `iteratePages` (`packages/bigname/src/paginate.ts`) walk `next_cursor`, restart up to three times on a `409 stale` continuation, and stop at `maxPages` (default 100) or `maxRows` (default 10,000). Caps the apps chose: manager name lists uncapped to 10,000 (the migration walk throws if truncated); portal record history 1,000 rows, address history 1,000 rows, held-names read 1,000, resolver links and roles 1,000, registry occupants 2,000, resolver events one page of 200, subregistry slot one page of 50; faucet five pages per authority; sweep 1,000 rows per window and 5,000 per exact timestamp. History walks never restart. Confidence: code.

### X9. Counts

Every counter accepts `null`: `total_count ?? 0` or `?? data.length` throughout. Exact totals now drive the portal "Names (N)" heading, the subname count card, the owned-registrations count, the migrated-names count and the resolver node count; the manager's dashboard count is the filtered list length, not `total_count` (M1.9). `contract_address` event feeds show no total (P6.6). Confidence: code.

### X10. Freshness and the Sepolia deployment's build

`meta.as_of` is unused. `/v1/status` now gates the portal's post-write refresh: `pollForIndexerSync.ts` polls it until the app chain's `indexed_block` reaches the write's block, then invalidates once (P11.1); the worker has no readiness gate (W2.5). Name detail carries `Cache-Control: max-age=12` (live), so a name profile can be up to 12 s old in a browser or edge cache. The live Sepolia deployment still serves the pre-#954 resolver overview shape; the portal's resolver page now reads the post-#954 shape (`bound_names`), so it will not render correctly until that build deploys (fixture 11). Confidence: live, code.

### X11. Basenames rows

Every address-name, subnames and sweep read passes `namespace: 'ens'` except the migration walk, the migrated count and the portal address history, which omit it. On Sepolia there is one namespace, so nothing changes; on a mainnet deployment with Basenames admitted those three reads could gain `*.base.eth` rows. Confidence: code.

### X12. Allow-listed controller set for ENSv1 `.eth` registration facts

Unchanged contract: names registered or renewed through an unadmitted Sepolia controller have no `registered_at`, and possibly no `expires_at`, in bigname. Visible now: the manager's v1 "Registered" date shows nothing for such a name (M3.5), and the portal's v1 "Registered" row is omitted (P2.1). Confidence: docs, code.

### X13. Stored zero address is absence

Unchanged contract; the forward-resolution page inherits it (P8.1). Confidence: docs.

### X14. Ownerless ENSv2 reservation resolver is not served

Unchanged contract; the manager and portal profiles show no resolver for a reserved-but-unmigrated name (M3.9). Confidence: docs, fixture.

## 3. Manager

Paths are relative to `apps/manager/src/` unless they start with `packages/` or `workers/`.

### 3.1 Dashboard "My names"

Now: `features/dashboard/service/queries/getDashboardNames.ts` walks `GET /v1/addresses/{a}/names?namespace=ens&relation=any&sort=name&include=role_summary&page_size=200` for each connected address (EOA, smart account, owner; deduped, lowercased) and, on a `422 unsupported` from the role-summary budget, walks again without it. `features/dashboard/dashboardNames.ts` merges rows by namehash (unioning `relations`, `role_summary` and `is_primary`), drops rows whose `registration_status` is not `active`, `wrapped` or `registered`, and maps the rest.

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| M1.1 | One list, still client-sorted | Two lists merged; name sort `localeCompare`; a migrated name's v1 row hidden by name match. | One collection per address, v1 and v2 rows together, one row per name. Sorting stays client-side over the full walk with `localeCompare` (`compareDashboardNames`), so the on-screen order is unchanged; the server's `sort=name` only orders the walk. | `dashboardNames.ts` | Neutral. | code |
| M1.2 | Which addresses' names appear | v2 rows for the EOA, smart account and owner; v1 rows for `ownerAddress ?? address` only. | Both eras for all three addresses. v2 names an address only manages (no token) now appear; the old v2 read was `owner_in`. | `useDashboardNames.ts` | Improvement; more rows. | code |
| M1.3 | Released and expired names | v1 filtered by `expiryDate_gt: now`; v2 rows past grace shown with a past date. | `isListedAddressName` drops `released` and `unregistered` rows in both eras; ENSv2 rows past their 28-day grace are still `registered` on bigname and still show, as before. | `dashboardNames.ts` | Neutral for v1; unchanged for v2. | code |
| M1.4 | Owner / Manager chips | v1 from registrant/wrappedOwner/owner; v2 "Owner" always plus "Manager" from any role bitmap. | `getAddressNameRoles`: `owner` or `registrant` relation gives Owner; `manager` relation, or an ENSv2 grant for any connected address in `role_summary` (`hasAnyGrant`), gives Manager. An empty summary never removes a chip. Role-only holders: fixture 1. | `dashboardNames.ts` | Improvement (no bitmap decode). | code, fixture |
| M1.5 | "Created" sort | v1 rows had no `createdAt` and sorted last. | `created_at` on every row; v1 rows sort by their first observation. Still client-side. | `dashboardNames.ts` | Improvement. | code |
| M1.6 | Search | Substring over label or name. | Substring over `name`, client-side; `q` (prefix-only) is not used. | `filterAndSortDashboardNames` | Neutral. | code |
| M1.7 | Expiry text | `0` "Does not expire"; null "Expires on —". | A held row without `expires_at` is `0` and renders `NON_EXPIRING_DATE_LABEL`; that covers never-expiring and out-of-range values alike. "Expires on —" is unreachable. Grace stays client-side (90/28 d). | `addressNameExpirySeconds`, `dashboard/utils.ts` | Improvement. | code |
| M1.8 | Primary marker | `isPrimary` for v2 rows matching the reverse-resolved label. | Unchanged: `dashboardRowMetadata` sets `isPrimary = !isV1 && label === primaryLabel`; the test "never flags v1 names as primary even on label match" locks it. bigname's `is_primary` is merged into the row but not read on the dashboard. | `dashboardNames.ts`, `dashboardNames.test.ts` | Neutral; the earlier "v1 primary gets the check mark" did not happen. | code |
| M1.9 | Owned count chip | Merged-array count, `undefined` on v1 error. | `names.length` after the status filter, `undefined` on error (`NamesTable.tsx`). | `NamesTable.tsx` | Neutral. | code |
| M1.10 | "ENSv1 only" / "Eligible for upgrade" pills | Pill from the data source. | `protocol` from `authority` (`ens_v0` is v1); eligibility from `useDashboardMigrationEligibility.ts`, which runs `classifyNames` over the bigname-fed `useV1Names` list while the migration flag is on. | `MyNamesList.tsx` | Neutral. | code |
| M1.11 | Bulk renew selection | v2 only, null and past-grace excluded. | Same rule on `protocol === 'v2'`; `expiryDate` `0` (no expiry) fails `isRenewableV2EthName` and is excluded. | `bulkRenewSelection.ts` | Neutral. | code |
| M1.12 | Displayed name | v2 rows showed the raw Panoptes name. | `row.name`, ENSIP-15 normalized. | api-v1.md `name` | Neutral. | code |

### 3.2 Migration: eligibility, "N names upgraded", profile replay

Now: `features/migration/service/v1Names.ts` walks `relation=any&authority=ens_v1&sort=name` and again with `authority=ens_v0`, drops `*.addr.reverse`, `released` and `unregistered` rows, then reads `POST /v1/lookup` (`profile=detail`, batches of 1,000) for the names and for parents not in the list (except `eth`). `packages/migration/src/service/v1Domain.ts` (`v1DomainFromBigname`) adapts each record into the `V1Domain` shape `classifyNames` still reads. `packages/dev-migration-tool/src/bignameMock.ts` intercepts the same three reads for panel-created names.

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| M2.1 | Eligibility inputs | Subgraph `labelName`, `owner`, `registrant`, `wrappedOwner`, `wrappedDomain`, `registration`, parent fuses. | (a) `labelName` is the first label of `name`; a `[64hex]` label is kept as the placeholder; a name whose `namehash(name)` does not match `namehash` gets `labelName: null` (unknown label). (b) Registry `owner`: for a `.eth` 2LD `manager ?? owner`, otherwise `owner ?? manager` (fixture 3). (c) `wrappedOwner` is `owner` when a wrapper entry exists. (d) Wrapper entry: present when `wrapper_state` and `wrapper_fuses` are; its expiry is `expires_at` plus 90 days for a wrapped `.eth` 2LD (the NameWrapper stores registrar expiry plus grace, api-v1.md `wrapper_expires_at`), `expires_at` itself for a wrapped subname, `0` when omitted and `wrapper_state=wrapped`, `type(uint64).max` when omitted and emancipated or locked. No permissions read. (e) `registration.expiryDate` is the bare `expires_at` for `.eth` 2LDs. (f) Active wrapper means `wrapper_state` present. (g) Released names drop at the moment the subgraph's `Domain.expiryDate` (lease plus 90 d) passed, so the list keeps the same cut-off. | `v1Domain.ts`, `v1Names.ts` | Neutral for the eligible list; plain-wrapped subnames past their wrapper expiry are now listed and classified as expired (they were filtered before). | code, fixture |
| M2.2 | Registry-only subnames | `setSubnodeOwner` children with `labelName: null` were listed and classified. | Absent by bigname design: a node known only from registry owner events has no name surface, no current row on address names and no name detail; its only listing is its parent's subnames route (api-v1-routes.md, address names status semantics, "A name bigname has never materialized as a name surface"). The "registry-child" copy route therefore has no candidates from the list, and unknown-label ineligible entries vanish instead of being shown as ineligible. | api-v1-routes.md ~L2509-2525 | Regression: such subnames cannot be migrated from the flow. Section 7. | docs, code |
| M2.3 | `nick.eth`: `registration_status: wrapped` without wrapper fields | n/a | Treated as an expired emancipated or locked wrapper: `{expiryDate: '0', fuses: 0}`; the on-chain ownership check rejects it if the wrapper really is expired. Wrong if the name is actually locked with live fuses. | `v1Domain.ts` `wrapperEntry` | Unverified; possible bigname defect (section 7, fixture 3). | live, code |
| M2.4 | "N out of T names upgraded" and the banners | Panoptes `isMigrated` count. | `relation=owner&is_migrated=true&dedupe=name&page_size=1`, `total_count ?? 0`: proven migrations only; native ENSv2 names and `ens_v0` never count. Drives `MigrationProgressBanner`, `UpgradeBanner`, `MigrationModal` and the commemorative NFT `complete` gate. If Panoptes counted native ENSv2 names the number drops. | `getMigratedNamesCount.ts` | Unverified parity (fixture 2). | code, fixture |
| M2.5 | Profile replay keys | Subgraph `texts`, `coinTypes`, `contentHash`, `abiChangeds`. | `POST /v1/lookup` `profile=detail&include=inventory` (`v1ProfileKeys.ts`): keys are `known_keys` plus `unsupported_keys` (`unset_keys` skipped), `avatar` as a text key, `contenthash` as a flag. A record with no inventory container, or `unsupported`, is left out and raises `ProfileFetchError{phase:'indexer'}` as the missing node did. Values are still read on-chain and empty ones dropped. | `v1ProfileKeys.ts`, `computeMigrationPreflight.ts` | Neutral. | code |
| M2.6 | ABI content types | `abiChangeds` then on-chain `ABI(node, type)`. | `abi_content_types` as listed; `null` (cannot answer) probes `[1, 2, 4, 8]` on-chain and drops empties, so a non-standard content type behind a `null` inventory is not copied. | `PROBED_ABI_CONTENT_TYPES` | Neutral for the four standard types. Section 6. | code |
| M2.7 | Error copy phase | `phase: 'subgraph'` | `phase: 'indexer'` (`decodeMigrationError.ts`); user copy unchanged. | code | Neutral. | code |

### 3.3 Profile (own profile, address profile, name profile)

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| M3.1 | Address profile "Names" list, Owned/Managed | Four reads and a merge. | `getAllAddressNames(address, {sort: 'registered_at', order: 'desc'})`, status filter as the dashboard, chips from `getAddressNameRoles`; rows with no chip are dropped; `roleCategory` is `owned` when the Owner chip is present, else `managed`. `registeredAt` and `createdAt` on every row. Reverse names are not rows, so the `.addr.reverse` filter is gone. | `features/profile/service/profileAddressNames.ts` | Improvement. | code, fixture (managed-only) |
| M3.2 | "Registered" line for a v1 primary | Always empty (v1 `createdAt` null). | `primaryEntry.registeredAt` from `registered_at`. | `AddressProfileHeader.tsx` | Improvement. | code |
| M3.3 | Expiry line | `0` "Does not expire"; null no line. | `addressNameExpirySeconds`: a held row without `expires_at` is `0`. | `profileAddressNames.ts` | Neutral. | code |
| M3.4 | Name profile owner and protocol | On-chain v2 owner, Panoptes `Domain` existence for a zero-owner 2LD, then v1. | On-chain v2 owner; for a zero-owner 2LD `GET /v1/names/{name}` and `authority === 'ens_v2'` means "v2, no owner"; `404`, `unsupported` and any other authority fall through to the v1 chain read. | `profileOwner.ts` | Neutral; no "unavailable" state (X3). | code |
| M3.5 | "Registered" date | Subnames from Panoptes; v2 2LDs Panoptes then chain; v1 via ensjs history plus `getBlock`. | `registered_at` from name detail first, for subnames and 2LDs. Without it: v2 2LDs fall back to on-chain `getRegistrationDate`; v1 names show no date (X12: unadmitted Sepolia controllers). Subnames have no fallback. | `profileRegistration.ts` | Improvement; v1 names registered through an untracked controller lose their date. | code |
| M3.6 | "Expires" for subnames | Panoptes `expiryDate`. | `expires_at` from name detail; omitted, `404` or any failure is null and renders as no expiry; no grace. 2LD expiry stays on-chain. | `profileExpiry.ts` | Neutral. | code |
| M3.7 | Non-expiring 2LD | Registry `0` plus owner. | Unchanged (on-chain); bigname's omitted `expires_at` is not used for 2LDs. | `profileExpiry.ts` | Neutral. | code |
| M3.8 | Record keys to read on-chain | Panoptes `resolver.texts` and `addresses`. | `GET /v1/names/{name}/records?include=inventory`: `known_keys` and `unsupported_keys` parsed with `parseRecordKey` (`text:`, `avatar`, `addr:`), unioned with the static lists; values on-chain. `404` or no inventory adds nothing. | `profileRecords.ts` | Neutral. | code |
| M3.9 | Reserved-but-unmigrated names | Panoptes showed the reserved resolver. | Not served (X14). | upstream.md | Neutral, fixture. | docs |
| M3.10 | Upgrade prompt (#1223) | From the migration list. | Same list, bigname-fed (M2.1). | `useV1Names.ts` | Neutral. | code |

### 3.4 Pricing, landing and search

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| M4.1 | Owned registrations count (auto primary-name setup) | Panoptes `registrationConnection` (v2). | `relation=registrant&dedupe=registration&page_size=1`, `total_count ?? 0`; v1 leases now count, a wrapped `.eth` name once. | `features/shared/service/ownedNamesCount.ts` | Neutral; the `< 5` default can flip for addresses with v1 names. | code |
| M4.2 | Landing redirect | Panoptes `domains(where: {owner}, first: 1)`. | `relation=owner&page_size=1`, `total_count > 0`, address lowercased. v1-only owners now redirect. No status filter: released ENSv1 names are not related to the lapsed holder by contract, but a released ENSv2 row is, so an address whose only name is a lapsed ENSv2 registration redirects to an empty dashboard. In `beforeLoad` a failed read is caught and keeps the user on the landing page (it used to throw); the client-side hook retries. | `hasOwnedNames.ts`, `routes/index.tsx` | Neutral; one edge. Section 6. | code |
| M4.3 | Search classification | On-chain owner or Panoptes existence. | `nameIndexStatus.ts`: `200` with `active`/`wrapped`/`registered` or `unsupported` is `held`; `released`/`unregistered` is `released` (not held); `404` and `400 invalid_input` are `not_indexed`. Combined with the on-chain owner read as before. | `useNameClassification.ts` | Neutral. | code |

### 3.5 Primary name dialog

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| M5.1 | Candidate list | Panoptes `domains(where: {owner: connected})`, first 100 by name; current primary first from reverse resolution. | `relation=owner&authority=ens_v2&sort=name&page_size=100` for the connected wallet (`useConnection().address`), single page, status filter, `is_primary` rows first. The reverse name is still read on-chain for the owner address to preselect. v1 names stay out by choice (section 6). On a smart-account session the candidates (connected wallet) and the reverse name (owner address) can be for different addresses; `is_primary` can lag a just-set primary. | `getPrimaryNameCandidates.ts`, `ChoosePrimaryNameDialog.tsx` | Product decision recorded. | code |

### 3.6 Grace and expiry banners, notifications

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| M6.1 | Dashboard grace banner | First v2 row in grace by ascending expiry over all Panoptes pages. | Same computation over the merged dashboard list (`resolveDashboardGraceBanner.ts`: v1 rows skipped, client sort by expiry ascending), after the full walk (`isAllPagesLoaded` is "query settled"). The server-sorted first-page shortcut was not taken. | `DashboardGraceBanner.tsx` | Neutral. | code |
| M6.2 | Grace constants vs bigname's lifecycle | 90 d v1, 28 d v2 client rules. | Unchanged; bigname has no grace flag and no ENSv2 grace concept. | `packages/utils/src/gracePeriod.ts` | Unverified alignment (fixture 4). | docs |
| M6.3 | Notification payload dates | Indexer seconds x 1000. | The worker parses RFC 3339 to seconds once; the manager payload stays ms. | `expiry-discovery/indexer.ts` | Neutral. | code |

## 4. Portal

Paths are relative to `apps/portal/src/`.

### 4.1 Dashboard, address names (`/addr/$addr`, `/addr/$addr/names`), search suggestions

Now: `features/dashboard/hooks/useAddressNames.ts` walks `relation=any&namespace=ens&include=counts,role_summary&sort=expires_at&order=asc&page_size=200` (falling back to `include=counts` on `422`), and `utils/names/addressNames.ts` maps rows to the shared table shape.

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P1.1 | Names that only resolve to the address | Included by ensjs's `resolvedAddress` clause (ETH address, coin 60), no badge, "assigned"; one 100-row page shared with the owned names. | A second full walk, `relation=resolves_to&coin_type=60&include=counts`, merged by namehash (`withResolvedNames`): a name on both reads keeps its authority row; a resolve-only name has `relations: ["resolves_to"]`, no badge, and lands in "assigned" unless the address holds its `.eth` 2LD. It is counted in "Names (N)" and the assigned heading, and shared with "Your names" and search, as before. bigname also matches an ENSIP-19 default EVM record (`addr:2147483648`) that no `addr:60` shadows, and its resolve-only ENSv2 names, neither of which the subgraph had. One extra request per 200 resolving names. | `useAddressNames.ts`, `addressNames.ts` | Restored. | code, live |
| P1.2 | "N Role(s)" badge on v2 rows | Set bits of the Panoptes bitmap. | `registryRoleBitmap`: grants for the viewed address whose scope is `root`, `registry` or `registration` and carry no `grant_relation` are mapped power by power to ensjs roles and re-encoded as a bitmap; `decodeRoleBitmap` then counts them. Resolver and operator grants are excluded, as Panoptes's `roles` read was. An empty summary yields no badge, which is not proof of no roles (partial by contract). | `addressNames.ts` | Number can change where a power maps to no ensjs role. | code |
| P1.3 | "Owner" / "Manager" badges on v1 rows | From `owner`/`registrant`/`wrappedOwner`. | `v1RolesFromRelations`: Owner when `registrant` is present or (`wrapped` and `owner`); Manager when `manager` is present. | `addressNames.ts` | Neutral. | code |
| P1.4 | Records / Subnames counts on mobile cards | v2 rows only. | `subname_count` and `record_count` on every row; `NameMobileCard` shows `0` when only one is present. | `NameMobileCard.tsx` | Improvement. | code |
| P1.5 | Expiry cell, "Does not expire", released rows | Invalid dates null; ensjs excluded expired v1; Panoptes listed expired v2. | `expires_at` omitted renders "Does not expire". `released` rows with `authority !== 'ens_v2'` are dropped; released ENSv2 rows are kept, matching the old v2 list. The "Expired" status filter therefore never sees a released v1 name. | `isLapsedV1` in `addressNames.ts` | Neutral by design; differs from the manager (section 6). | code |
| P1.6 | Caps | v1 stopped at 100. | Full walk, exact "Names (N)". | `fetchAllPages` | Improvement. | code |
| P1.7 | Sort order | Expiry ascending, null last. | Server `sort=expires_at&order=asc`, omitted expiries last; the client keeps the server order. | api-v1.md `expires_at` | Neutral. | code |
| P1.8 | Search "Names you own" (#1242) | v1 names plus each owned v2 name and all its `subdomains` (unbounded, expired and ownerless included). | The same address-names query (shared cache entry), substring client-side, plus a stopgap fan-out pending a bigname relation: for up to 25 owned ENSv2 names with a non-zero `subname_count`, one `GET /v1/names/{name}/subnames?include_expired=false&sort=name&page_size=200` each, four at a time, only once there is a search value. Expired, ownerless and no-name-row children, and children past the first 200 by name, are not suggested. | `useOwnedSubnames.ts`, `ownedNamesUtils.ts` | Restored with caps. | code, live |
| P1.9 | Acquired vs assigned partition | `v1Roles.owner` plus the 2LD ancestor rule. | `holdsRegistrarName` reads `relations` (`registrant` or `owner`); `manager` alone is not a root. | `features/address/nameAttribution.ts` | Neutral. | code |
| P1.10 | Error copy | Two banners. | One: "Error fetching names. Please refresh the page." | `NameList.tsx` | Neutral. | code |

### 4.2 Profile overview, records tab, subnames

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P2.1 | v1 "Registered" row | First `NameRegistered` block via ensjs, then `useBlock`; no tx link. | `registered_at` from `useV2RegistrationData` (name detail, any authority), linked to the oldest `registration` row (`type=registration&order=asc&page_size=1`); omitted when `registered_at` is absent (X12). | `ExpiryWithRegistrationData.tsx` | Improvement. | code |
| P2.2 | v2 "Expires" row and the max-uint64 crash | `Timestamp(expiry)` unguarded. | `expires_at` is omitted for such values; the row is skipped. | `useV2RegistrationData.ts` | Fixes a latent crash. | code |
| P2.3 | v2 "Registered" tx badge | Panoptes earliest `NameRegistered`. | Same `order=asc&page_size=1` history read; oldest-first still yields the registering transaction even though one ENSv2 registration can be several rows. | `ExpiryWithRegistrationData.tsx` | Neutral. | code, live |
| P2.4 | "Grace ends" | `useGraceStatus` with ensjs `getExpiry` or Panoptes. | Unchanged file; its v2 path reads `expires_at` through `useV2RegistrationData`. | `useGraceStatus.ts` | Neutral. | code |
| P2.5 | Subnames count card | Length of a 100-row page. | `GET /v1/names/{name}/subnames?include_expired=false&page_size=1` `total_count`, exact, including placeholder children the table drops; `404` is `0`. | `getSubnameCount` in `useSubnames.ts` | Improvement; the card can exceed the table's row count. | code |
| P2.6 | Records tab key set | Subgraph and Panoptes keys merged with defaults. | `records?include=inventory`: `known_keys` and `unsupported_keys` unioned with the default texts and coins (`recordKeysToRead`), values on-chain. A name behind an unadmitted resolver keeps the defaults plus whatever `unsupported_keys` lists. | `useProfile.ts` | Neutral. | code |
| P2.7 | Records "Records (N)" and ABI | On-chain. | Unchanged. | `useProfile.ts` | Neutral. | code |
| P2.8 | Subnames table rows | ensjs (v1) or Panoptes (v2). | One walk of `subnames?include_expired=false&sort=name`. Dropped: rows without `owner`, and rows whose label is not a name form (a `[labelhash]` placeholder, escaped bytes, a non-normalized label, or a label that does not hash to `labelhash`), which used to link to broken routes. `owner` is the token holder, checksummed. A migrated child appears once. | `toSubnames` in `useSubnames.ts` | Improvement; fewer rows than the count card. | code |
| P2.9 | "Already registered" check on create-subname | `labelName` match over the list. | Same match over the filtered list; a child whose label bigname cannot state is not in it. | `routes/$name/create-subname.tsx` | Edge: the on-chain write still fails for a taken placeholder label. | code |
| P2.10 | "No subregistry" state | On-chain and indexer reads. | Unchanged route logic; `hasSubregistry` gates the subnames read. | `routes/$name/subnames.tsx` | Neutral. | code |
| P2.11 | Protocol row "ENSv1 : Can be migrated" | On-chain detection plus `useMigrationStatus`. | `useMigrationStatus.ts` reads name detail and the parent (P10.1). | code | Neutral. | code |

### 4.3 History timeline (`/$name/history`, overview preview, resolver-scoped and address-record-scoped feeds)

Now: `features/history/timelineEventPage.ts` reads `GET /v1/names/{name}/history?include=data,raw` (plus `child_registrations` for the unfaceted full history, never for `eth` or `base.eth`), with a positive `type` set, `from_timestamp`/`to_timestamp`, `order` and cursor; an empty type intersection returns an empty page without a request. `features/history/eventTypes.ts` holds the facets in bigname's vocabulary (`OWNERSHIP_HISTORY_TYPES`, `RESOLVER_HISTORY_TYPES`, `ADDRESS_RECORD_HISTORY_TYPES`), passed by `routes/$name/ownership/index.tsx`, `routes/$name/resolver.tsx` and the address resolution sidebar; the legacy event names are gone. `summarize/descriptors.ts` and `summarize/summarizeEvents.ts` word the rows.

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P3.1 | One stream for both eras | Auxiliary uncursored v1 read, truncation notice, RPC timestamps. | One cursor; `mergeTimeline.ts`, `adaptV1Events.ts`, `fetchV1NameHistory.ts` deleted; the "too large to read" notice is gone; the anchor error copy is "Couldn't load this name's first event, so it may be missing below." | `useNameHistoryTimeline.ts`, `HistoryTimeline.tsx` | Improvement. | code |
| P3.2 | Event chips and row badges | Sampled raw types, 27 labels. | Chips are the eleven types with fixed labels (`HISTORY_EVENT_TYPE_LABELS`: Registration, Renewal, Release, Expiry, Transfer, Registry owner, Resolver, Record, Primary name, Permission, Subregistry). The per-row badge is the raw `kind` (`LabelRegistered`, `RecordVersionChanged`, ...) with the type as fallback. New rows: `release`, `expiry` (beside every renewal on Sepolia), `authority`. `NewTTL`, `PubkeyChanged`, `InterfaceChanged`, `AuthorisationChanged` no longer appear. | `eventTypes.ts`, `EventRow.tsx` | Chip set and per-transaction "N events" change. | code, live |
| P3.3 | Decoded parameters and headline wording | `cost`, `tokenId`, `canonicalId`, `operator`, `sender` rendered; "minted token ID". | `data` per type only; the decoded table shows its flat fields. Wording: "registered" / "registered subname"; "transferred token ID {id} to" / "minted token ID {id} to" with the address where the token id is exact (BaseRegistrar rows: labelhash; NameWrapper rows: namehash; a NameWrapper row whose `from` is the wrapper reads as a mint), else "transferred to" / "minted to"; registration and transfer rows with an exact token id add `token_id` to the decoded table (`historyTokenId.ts`); "set registry owner to"; "linked subregistry" / "unlinked subregistry" (was "deployed and linked"); "set roles ... for" / "revoked roles from" (was "granted role"); "cleared records" for `RecordVersionChanged`; "set primary name"; "updated expiry"; a group of mints only reads "emitted {kind}". The sender badge still comes from the receipt. ENSv2 registry rows have no token id: the id carries a version counter history does not serve. | `descriptors.ts`, `EventRow.tsx`, `historyTokenId.ts` | Regression for explorer detail (ENSv2 token id, cost, referrer, operator). | code, live |
| P3.4 | Contract badge | Rebuilt for v1. | `contract_address` when present; omitted for state-derived rows; labelled "resolver" for `record` rows. | `EventRow.tsx` | Neutral. | code |
| P3.5 | Ordering and grouping | Timestamp then id; grouped by tx hash. | Chain position; grouped by transaction, and a row with no transaction (`release`, boundary `expiry`) is its own action keyed `row:{id}`. The boundary trim (`dropClippedBoundary.ts`) stays, keyed on timestamp. | `summarizeEvents.ts`, `timelineEvent.ts` | Neutral. | code |
| P3.6 | Total count | Omitted when truncated or filtered. | `page.total_count` of the last page (exact to 10,000, then absent), following the type set and window. | `useHistoryTimeline.ts` | Improvement. | code |
| P3.7 | Child registrations | First `LabelRegistered` of the first 25 subdomains, capped. | `include=child_registrations` on the full history only (not with a facet; the chip selection does not remove it); rows with `subject: 'child'` read "registered subname {child}". No cap; released children kept; one ENSv2 registration can still yield two or three rows (fixture 8); `setSubnodeOwner` children on ENSv1 parents have no `registration` row and are absent (M2.2). `eth` and `base.eth` are never asked (`400`). | `timelineEventPage.ts`, `useHistoryTimeline.ts` | Improvement with a multi-row display question. | code, live |
| P3.8 | Date range chip | Inclusive UTC day bounds. | `from_timestamp`/`to_timestamp`, inclusive, from the same day bounds. | `filterTimeline.ts` | Neutral. | code |
| P3.9 | Anchor (oldest 20) | Separate ascending read. | `order=asc&page_size=20` on the same route and scope, one retry. | `useNameHistoryTimeline.ts` | Neutral. | code |
| P3.10 | "Migrated ... to ENSv2" wording | `protocol` on NameWrapped/NameUnwrapped. | Since v0.4.1 a `migration` row (`MigrationApplied`) headlines its transaction as "migrated {name} to ENSv2 ({path})" from `data.migration_path`; the row reads "migrated to ENSv2 ({path})". Unwrapping from ENSv2 has no row. | `descriptors.ts`, `EventRow.tsx` | Restored. | code, live |
| P3.11 | Ownership-, resolver- and address-record-scoped feeds | Legacy event-name lists. | Ownership facet: `registration,renewal,release,expiry,transfer,authority`, so `release` rows now appear and `FusesSet` rows (shown as permission before) do not. Resolver facet: `resolver,record`, which now includes `clearRecords` resets and every record key rather than six legacy event names. Address-resolution sidebar: `type=record`, then `isAddressRecordEvent` narrows the loaded rows to `addr:*`, `name` and keyless (reset) rows client-side; the total count is hidden there, and a page whose rows are all filtered out still offers "load more". | `eventTypes.ts`, `useHistoryTimeline.ts` | Row sets change per facet. | code |
| P3.12 | Multi-record headline | n/a | "set N records" dedupes the legacy `AddrChanged` plus `AddressChanged` pair by key and value and ignores `RecordVersionChanged`. | `summarizeEvents.ts` | Neutral. | code |

### 4.4 Address history (`/addr/$addr/history`, recent five on `/addr/$addr`)

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P4.1 | Which names contribute | v1 owner/registrant (no wrapped names), 100 names; v2 nested events. | `GET /v1/addresses/{a}/history?relation=any&include=data,raw&order=desc`, up to 1,000 rows (or one page of 5 for the teaser); wrapped v1 names included. Rows without a `transaction_hash` are dropped (the table groups by transaction). Rows without `name` group under a null name. Ended relations are not reproduced (contract limitation). | `features/address/hooks/useAddressHistory.ts` | Improvement; a 1,000-row cap replaces the 100-name cap. | code |
| P4.2 | Acquired vs assigned | `registrarHolder` per name from the indexer. | A second walk, `relation=any` names (up to 1,000 rows), marks a name held when `relations` has `registrant` or `owner`; `registrarHolder` is the address for those. Senders still from receipts. | `readHeldNames` | Neutral. | code |
| P4.3 | Event group filter and decoded table | `[object Object]` refs, leaked `category`/`timestamp` rows. | Flat `data` (contracts by address, lists joined); `timestamp` and `category` filtered from details. | `historyEventsToSubgraphEvents.ts`, `filterEventDetailsMetadata.ts` | Fixes display defects. | code |
| P4.4 | Recent five | v2 only. | `page_size: 5` of the same stream; v1 events included; loader prefetches the same key. | `routes/addr/$addr/index.tsx` | Improvement. | code |
| P4.5 | Timestamps and table states | RPC; "Loading timestamps" and "Error fetching timestamps" states. | On the row; the table takes `AddressNameHistory[]` and the two timestamp states are gone. "Loading transaction senders" and its error remain (senders still come from receipts). | `AddressHistoryDataTable.tsx` | Improvement. | code |
| P4.6 | Network column | Hard-coded. | Unchanged. | n/a | Neutral. | code |

### 4.5 Record history (`RecordDetails`, forward-resolution sidebar, reverse-resolution sidebar)

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P5.1 | Which resolvers' writes are shown | Current resolver only (v1). | `history?type=record&include=data,raw&order=desc`, every resolver the name pointed at, capped at 1,000 rows (`RECORD_HISTORY_MAX_ROWS`). | `features/records/hooks/useRecordHistory.ts` | Improvement; longer histories, silent cap. | code |
| P5.2 | Per-key filtering | v1 by key; v2 type only (every text row under every text record). | Client filter on `data.key`: families `coins` (`addr:`), `texts` (`text:` or `avatar`), `contentHash`, `abi`, or one exact key. A `RecordVersionChanged` row (`clearRecords`) carries no key and is included in every record's history. Rows without a transaction are dropped. `dropDoubleEmits` collapses the legacy `AddrChanged` plus `AddressChanged` pair by transaction, key and value. `value` shown when retained. | `useRecordHistory.ts` | Improvement for v2. | code |
| P5.3 | Date column | RPC, "Block N" fallback. | `timestamp` on every row. | `ForwardNameDetails.tsx`, `ReverseResolutionSidebar.tsx` | Improvement. | code |
| P5.4 | Stored zero address | Row with the zero value. | Still a row in history; absent from the current inventory (X13). | upstream.md | Neutral. | docs |

### 4.6 Registry pages

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P6.1 | Header counts | `labelCount`, `roleCount`, `eventCount`. | `GET /v1/registries/{chain}/{addr}?include=counts`: `labels`, `roles` (declared assignments: one account on two resources counts twice), `events`; each `?? 0`. | `features/registry/hooks/useRegistry.ts` | Unverified parity for `roles` (fixture 10). | code, fixture |
| P6.2 | "Deployed" tx badge | Separate `SubregistryUpdated` query with its own loading skeleton and error state. | `DeployedBadge` reads `registry.createdTransactionHash` (`created_transaction_hash` on the overview, null for a declared registry such as the root). No badge-level loading or error state: with a hash it is a tx badge labelled with the date; without one it shows the date, or a dash placeholder when there is none. `useRegistryDeployment` is deleted. | `useRegistry.ts`, `routes/registry/$address/index.tsx` | Improvement. | code |
| P6.3 | Registry tree "Labels: N" and "Created" | Count, first event tx, unused sample. | Overview fields; the sample read is deleted. | `useRegistryLabelCount.ts` | Neutral. | code |
| P6.4 | Labels table | First 100; `unixSecondsToPlainDateUtc` threw on max-uint64. | `/labels?include=counts&page_size=100`: placeholder rows keep `name: null`; omitted `expires_at` renders "Does not expire"; `role_holder_count ?? 0`; `404` is an empty list. | `useRegistryLabels.ts` | Fixes the crash. | code |
| P6.5 | Subregistry slot: detached vs never configured | `SubregistryUpdated` count. | `history?type=subregistry&page_size=50`; rows emitted by the ENSv1 registries (`ensRegistry`, `ensLegacyRegistry`) are not links; state-derived rows count; zero links with `has_more` is unknown, rendered as `error` (fails closed); an unnormalizable name is unknown too. | `useSubregistrySlot.ts` | Neutral. | code |
| P6.6 | Registry history feed | `contractAddress` events with a total. | `GET /v1/events?contract_address=...&include=data,raw`; no total (null by contract); the header uses `counts.events`. | `fetchContractEventsPage` | Neutral. | code, live |
| P6.7 | Detach impact copy | Two Panoptes totals. | Every label read, up to 2,000 rows; a label whose `owner` is missing or differs from the caller is a third party; a `404` or a truncated walk yields `null` and the form says it could not check. | `useRegistryOccupants.ts` | Cost regression, fails closed above 2,000 labels. | code |

### 4.7 Resolver page

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P7.1 | Counter cards | `nodeCount`, `roleHolderCount`, client `linkCount`. | Four reads: overview (`bound_names`, 200 per page, `total_count` as `nodeCount`), `/links` and `/roles` walked to 1,000 rows, `/v1/events?resolver=` first 200 rows with `total_count` as `eventCount`. `roleHolderCount` is distinct lower-cased accounts; `linkCount` is the grouped links. The live deployment still serves the pre-#954 shape (X10). | `features/resolver/hooks/useResolverOverview.ts` | Neutral once deployed; more requests. | code, live |
| P7.2 | Recent events and "History (N)" | Unbounded `resolver.events`; the heading counted the loaded rows. | First 200 events, newest first; the history page heading shows `eventCount` (bigname's `total_count`, absent past 10,000), falling back to the loaded count, so it can exceed the 200 rows on screen. The filter includes `resolver` pointer rows, so names pointing at the resolver appear. | `useResolverOverview.ts` | Improvement; 200-row window. | code |
| P7.3 | Nodes page "Active/Inactive" | Resolver equality. | `bound_names` lists names whose current registration declares this resolver; every row is active; former nodes are not listed. | `useResolverOverview.ts` | Regression for "Inactive" rows. | code |
| P7.4 | Roles table | Bitmap rows. | `/roles` rows; `powers` re-encoded to the resolver role bitmap (`set_pubkey`, `set_alias`, `clear_records` have no bit and are dropped); scope from `record_resource` (`address`, `text`/`data`, `abi`, `interface`). Whether `powers` is the set after the grant or the delta is not stated in the contract, so a scoped admin can display wrongly. | `powersToResolverRoleBitmap` | Improvement; one semantic question (section 7). | code |
| P7.5 | Links page | Client grouping. | `/links` rows grouped by `record_id`; default and unnamed rows left out. | `toLinkedName` | Improvement. | code |
| P7.6 | Role history table | RPC `getLogs` over `EACRolesChanged`. | Unchanged: `lib/roles/roleChangeLogs.ts` keeps reading logs, because `permission` rows carry no before-set. | `RoleHistoryTable.tsx` | Neutral. Section 6. | code |

### 4.8 Forward and reverse resolution

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P8.1 | Which names are listed | ensjs `resolvedAddress` (coin 60 only). | `relation=resolves_to&coin_type=evm&sort=name`, full walk: coin 60 and every ENSIP-11 EVM coin type, the ENSIP-19 default once. Names set only for Base or another EVM chain appear; zero-address coin-60 records disappear (X13); non-EVM coin types are not searched, as before (the subgraph's `resolvedAddress` follows `AddrChanged`, coin 60 only). Registry-only subnames the subgraph listed are absent (M2.2): every name route answers `not_found` for them. | `useNamesForResolvedAddress.ts` | Improvement; more names, registry-only subnames lost. | code, live Sepolia |
| P8.2 | "Networks" column | Every coin type the resolver has (`resolver.coinTypes`, kept after a clear). | Every coin type in the name's `records.seen_addresses` from one `POST /v1/lookup` (`profile=detail`) per 1,000 listed names, except those mapped to `null` (cleared), plus `resolutions[].coin_type`; ascending. A name served without `records` (unsupported, no inventory, `not_found`) shows only its matched coin types. Non-EVM coin types are labelled by coin name. | `toForwardNames` | Restored, except cleared records. | code, live Sepolia |
| P8.3 | Sidebar record history | Current resolver only. | `coins` family of the record history (P5). | `ForwardNameDetails.tsx` | Improvement. | code |
| P8.4 | Reverse sidebar | On-chain. | Unchanged apart from the record-history source. | `ReverseResolutionSidebar.tsx` | Neutral. | code |

### 4.9 Recent activity (home page)

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P9.1 | Feed contents and wording | Panoptes `eventConnection(first 15, type_not_in: [CommitmentMade])`; rows keyed by raw event name. | `GET /v1/events?order=desc&page_size=15&include=data,raw`, no type filter. `RecentActivityEvent` carries `{type, kind, data}` (no `domain`), and `formatActivityEvent` words rows by bigname type: registration "Registered by" `registrant ?? owner`; `transfer` and `authority` "Ownership transferred to"; `release` "Name released" (the raw `NameReleased` had no text); `expiry` "Expiry extended"; `subregistry` "Subregistry updated"; `permission` "Fuses updated" or "Roles updated"; `record` rows by key (`RecordVersionChanged` "Resolver records cleared", an unknown key "Record updated" with the key as a pill, a `name` record write "Primary name updated" with the value pill); `primary_name` rows "Primary name updated" with `data.name` as the value pill when `name_status` is `set`; `migration` rows "Migrated from ENSv1 to ENSv2" with the path as the value pill. The `tokenId:`/`canonicalId:` guards are gone. Rows without a transaction are dropped; rows without `name` render with a null name and namehash. ENSv1 activity appears. Each primary-name set also yields a `record` row (`key: name`, no value) that reads "Primary name updated" without a pill. | `features/dashboard/hooks/useRecentActivity.ts`, `utils/formatActivityEvent.ts` | Improvement; migration text and `primary_name` pill restored in v0.4.1. | code, live |
| P9.2 | Total | Unused. | Unused. | n/a | Neutral. | code |
| P9.3 | Refetch | 30 s. | 30 s while only the first page is loaded, `staleTime` 15 s. | `useRecentActivity.ts` | Neutral. | code |

### 4.10 Migration status ("Upgrade to ENSv2" prompts)

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P10.1 | Inputs to `classifyName` | Raw subgraph `V1Domain`. | `GET /v1/names/{name}` plus the parent; migratable only when `authority` is `ens_v1` or `ens_v0` and `registration_status` is not `released`; `v1DomainFromBigname` (M2.1) builds the domain. A name with a released ENSv2 registration is `ens_v2` and gets no prompt even with a live ENSv1 lease. | `features/migration/hooks/useMigrationStatus.ts` | Edge change. | code |
| P10.2 | "Reserved on ENS v2" copy | v1 status. | Unchanged. | n/a | Neutral. | code |

### 4.11 Indexer sync after writes

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| P11.1 | Post-write refresh | Blind polling: wait 5 s, then five invalidations 3 s apart (~17 s), regardless of indexer state. | Same signature plus an optional `blockNumber`. `pollForIndexerSync` reads the target (the receipt block, or the chain head over RPC at call time, since no caller passes a receipt yet), then polls `bigname.getStatus()` until `chains[sepolia].indexed_block` reaches it and invalidates once: first check after 1 s, then every 2 s, up to 30 checks (~60 s), after which it invalidates anyway. An unreadable head invalidates immediately; a status error counts as "not yet". Awaiting screens (records save, resolver links and roles) finish sooner when bigname is caught up and later, up to ~60 s, when it lags. The 12 s cache header on name detail can still delay a refreshed profile by one slot. | `utils/query/pollForIndexerSync.ts` | Improvement; timing change (fixture 19). | code, live |

## 5. api-worker

Paths are relative to `workers/api-worker/src/`.

### 5.1 Migration gas faucet gate (`POST /wallet/fund`)

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| W1.1 | Host | Hard-coded ENSNode subgraph. | The network profile's `endpoints.bignameApi` (`@ens-apps/config`, via `getConfig`), the same deployment as the apps. | `core/bigname/index.ts` | Improvement. | code |
| W1.2 | Gate predicate | `domains(first: 1)` with reverse, expiry and husk exclusions. | `hasV1Names`: for `authority=ens_v1` then `ens_v0`, `relation=any&sort=expires_at&order=desc&page_size=200`, at most five pages each; a row counts when its name is not `reverse`/`*.reverse`, its status is not `released` or `unregistered`, and `expires_at` is absent or in the future (an unwrapped subname without an expiry counts). The walk stops once a page ends on a lapsed row. Any error throws and the caller skips the drip. | `services/v1-names/index.ts` | Neutral. | code |
| W1.3 | `ens_v0` | n/a | Counted as migratable v1 (section 6). | same | Neutral. | code |

### 5.2 Expiry reminder discovery (hourly cron)

| # | Difference | Before | Now | Why | Impact | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| W2.1 | Route and window | Panoptes `expiry_gt/lte`, 1,000 per page. | `GET /v1/names?namespace=ens&expires_after=cursor+1&expires_before=upper+1&sort=expires_at&order=asc&page_size=200`, up to 1,000 rows per window (`QUERY_PAGE_SIZE`); an exact-timestamp bucket `[T, T+1)` is walked to 5,000 rows, and the overflow alert now says the row limit was reached. Seven stages at up to five pages each, so up to ~70 requests per run against ~14. | `services/expiry-discovery/indexer.ts`, `page.ts`, `overflow-alert.ts` | Improvement (no skipped names at a timestamp); more requests. | code |
| W2.2 | Which names are in the sweep | Every Panoptes domain with an expiry. | Rows with a numeric lease expiry only: registrar leases (bare), ENSv2 registrations, wrapped subnames with an expiry. Wrapper-only expiries, `type(uint64).max` and out-of-range values get no reminder. Released rows are returned and kept in page planning; `registrationStatus` rides on each row. | api-v1-routes.md `GET /v1/names`; `indexer.ts` | Regression for wrapper-only expiries. | code, docs |
| W2.3 | Stage-by-status rule | Every row at every stage. | `isNotifiableAtStage` (`stages.ts`): before expiry (`expiry-30d/7d/1d`) only held rows (`active`, `wrapped`, `registered`); at `grace-start` every row; at `grace-7d`, `grace-1d` and `premium-start` only rows no longer held. So an ENSv1 lease (held through its 90-day grace) gets the pre-expiry and grace-start notices and no longer gets the three 28-day notices that were wrong for it; an ENSv2 registration (served `released` once its expiry passes) gets them. No v1 notice exists at expiry plus 90 days. A row without a status is kept. | `stages.ts`, `index.ts` | Improvement for v1 timing; a missing v1 end-of-grace stage. | code |
| W2.4 | Who gets notified | `owner.id`. | `owner ?? registrant`, lowercased. Released ENSv2 rows carry neither, so their `grace-7d`, `grace-1d` and `premium-start` notices reach favourites only, never the former owner (`buildExpiryEvents` sends `owner: undefined`). | `indexer.ts`, `queues/event-ingestion.ts` | Regression for lapsed ENSv2 owners (section 7). | code |
| W2.5 | Validation | Null expiry fails the page. | A row without a parseable `expires_at` fails the stage (`IndexerValidationError`); by contract every row has one. | `indexer.ts` | Neutral. | code |
| W2.6 | Readiness and stale pages | No check. | No `/v1/status` gate. First-page `409 stale` is retried in the client; a stale continuation restarts the walk up to three times; after that the stage fails and its cursor does not move. | `paginate.ts`, `index.ts` | Neutral. | code |
| W2.7 | Timing | Panoptes seconds. | Assumed bare on both sides (X7); stage windows unchanged. | `stages.ts` | Fixture 4. | code, fixture |

## 6. Decisions this branch made

Each of these is a judgement call in the migrated code that a reviewer may want to overrule.

1. `ens_v0` is v1 everywhere: manager dashboard and profile (`protocolForAuthority`), migration walk, portal address list and migration status, faucet.
2. Released and unregistered rows: the manager drops both eras on the dashboard, profile list, primary dialog and migration list; the portal drops released ENSv1 rows and keeps released ENSv2 rows (matching its old v2 list); the faucet drops both and any row with a past `expires_at`; the reminder sweep keeps them and decides per stage.
3. Primary-name dialog restricted to `relation=owner&authority=ens_v2`, first 100 by name, `is_primary` first; the reverse name is still read on-chain for preselection.
4. The dashboard's primary check mark still comes from reverse resolution and is v2-only; bigname's `is_primary` is not read there.
5. Manager `beforeLoad`: a failed `hasOwnedNames` read keeps the user on the landing page instead of throwing.
6. Manager `unsupported` name detail counts as "held" in search and falls through to the chain on the profile; no "unavailable" rendering.
7. Manager v1 registration date has no chain fallback: a v1 name without `registered_at` shows no date.
8. Migration adapter (`v1Domain.ts`): wrapper expiry is `expires_at + 90 d` for wrapped `.eth` 2LDs and `expires_at` for wrapped subnames; omitted means `0` when `wrapper_state=wrapped`, else max uint64; `wrapped` without wrapper fields is an expired wrapper with fuses `0`; the registry owner of an unwrapped 2LD is `manager ?? owner`; a namehash mismatch is an unknown label; no `/v1/permissions` read.
9. ABI fallback probes content types 1, 2, 4 and 8 when `abi_content_types` is `null`.
10. Migrated-names count uses `is_migrated=true` (proven migrations only) for the progress banner, upgrade banner, modal and NFT gate.
11. Portal resolve-only names are re-added to the address list (coin 60, second `resolves_to` walk), under "Names assigned to this address".
12. Portal "N Roles" folds registry powers back into the ensjs bitmap; resolver and operator grants are excluded; an empty `role_summary` shows no badge.
13. Portal subnames table drops placeholder, escaped, non-normalized, hash-mismatched and ownerless rows; the count card includes them.
14. Rows without a transaction (state-derived `release`, boundary `expiry`) are dropped from the address history, record history, recent activity and resolver feeds; the name timeline keeps them as their own action.
15. Child registrations are requested only for the unfaceted full history; a facet or an empty type intersection never asks.
16. `RoleHistoryTable` stays on RPC `getLogs` because `permission` rows carry no before-set.
17. Caps: record history 1,000 rows, address history 1,000 rows plus a 1,000-row names read, resolver links and roles 1,000, resolver events 200, registry occupants 2,000 (null above), subregistry slot 50 rows (null when empty with more), faucet five pages per authority, sweep 1,000 per window and 5,000 per timestamp.
18. Subregistry slot ignores rows emitted by the ENSv1 registries and counts state-derived rows.
19. Recent activity is worded by bigname `type` and `kind` in `formatActivityEvent`; the shim to the old wording keys is gone; polling stops once a second page is loaded.
20. Reminder sweep: stage-by-status rule as in W2.3; no `/v1/status` readiness gate; `owner ?? registrant` as the recipient.
21. `namespace=ens` is passed on most reads but not on the migration walk, the migrated count or the portal address history.
22. One deprecated shim kept: `historyEventsToSubgraphEvents` for the TLD route (`routes/tld/$tld/index.tsx`, fed by `getNameHistoryQueryOptions`). `useRegistryDeployment`, the recent-activity type mapping and the legacy facet names are deleted.
23. `pollForIndexerSync` waits on `/v1/status` `indexed_block` with a ~60 s bound; callers do not pass the receipt block yet, so the chain head at call time stands in for it.

## 7. Needs a bigname change

Candidates only; none is decided.

1. Registry-only ENSv1 subnames (`setSubnodeOwner`/`setSubnodeRecord`, never wrapped) have no name surface, so no address-name row and no name detail, even when a label preimage exists (api-v1-routes.md, address names status semantics). The migration copy route, the manager dashboard and the portal address list cannot show them. A surface or a "registry-only" listing would restore them.
2. Lapsed ENSv2 registrations: `GET /v1/names` rows and name detail carry no `owner`, `registrant` or `lapsed_registration` for them, so reminder emails during the 28-day grace cannot reach the former owner. Exposing the last holder (as `lapsed_registration` does for ENSv1) would fix W2.4.
3. `nick.eth` on Sepolia: `registration_status: wrapped` with neither `wrapper_state` nor `wrapper_fuses`, which the docs say are present exactly when the name is in a wrapper state.
4. `permission` history rows: no before-set, and whether `powers` is the subject's set after the change or the delta is not stated (api-v1-routes.md payload table). The timeline assumes after-set; the roles table cannot show a diff.
5. Timestamp spelling: the live deployment emits `+00:00` on `registered_at`/`created_at` and `Z` elsewhere; the contract says `Z`.
6. `restrictions.wrapper_expires_at` served as `1970-01-01T00:00:00Z` for a wrapped subname with no expiry (live); the apps no longer read the field.
7. `authority` filter takes one value, so v1 reads need two walks (`ens_v1`, `ens_v0`).
8. `role_summary` is partial by contract, so an empty summary cannot drive a "no roles" state; role-only holders under `relation=manager` are undocumented.
9. No `type_not_in` or raw-kind filter on history; no server-side record-key filter; no owner filter on `/labels`; `q` is prefix-only; no `created_at` sort on address names; `total_count` null on `contract_address` event reads.
10. Resolved in v0.4.1: `migration` rows (`data.migration_path`) and `primary_name` rows with `data.name` restore "Migrated from ENSv1 to ENSv2" and the primary-name value pill.
11. One ENSv2 registration produces several `registration` rows under `include=child_registrations`; a row-level marker for the grant versus the `TokenResource` copy would let the timeline collapse them.
12. Unattributed `record` rows arrive without `name` on `/v1/events` (live).
13. The Sepolia deployment runs a build older than `main` (resolver overview shape). Deployment, not contract.
14. History rows carry no token id. ENSv1 BaseRegistrar and NameWrapper ids derive from the name, but an ENSv2 registry token id is the labelhash with its low 32 bits replaced by `tokenVersionId`, which unregister, re-registration and each `grantRoles`/`revokeRoles` call that changes roles bump (`PermissionedRegistry._constructTokenId`, `_regenerate`); history does not carry the counter, and its permission rows do not map one-to-one to bumps, so ENSv2 rows show none. Separately, name detail's `token_id` for `envoy1084.eth` (ENSv2) is the bare labelhash (`…26440146fa`), while the registry's `getTokenId` returns `…2600000000` and `ownerOf` of the served value is the zero address (live, 2026-10-05).

## 8. Open questions that need a live fixture check before shipping

Sepolia deployment for the checks below: `https://sepolia.api.bigname.sh`, `ready` at block 11 798 989 on 2026-09-28, predating several `main` changes (X10).

1. Role-only ENSv2 holders under `relation=manager` (M1.4, M3.1, P1.2). If absent, the Manager chip and "Managed" section need `/v1/permissions?address=`.
2. "N names upgraded" parity (M2.4): compare Panoptes `isMigrated` with `is_migrated=true&dedupe=name` on an address with migrated and native ENSv2 names.
3. `nick.eth` wrapped without wrapper fields (M2.3), and the `manager ?? owner` registry-owner mapping for unwrapped 2LDs (M2.1b): confirm on a plain unwrapped `.eth` name whose registry owner differs from the token holder.
4. Grace (X7, W2.7): confirm Panoptes served v1 names with a bare `expiryDate` (the schema's separate `gracePeriodEnd`) so no dashboard or reminder date moves.
5. Unadmitted Sepolia controllers (X12, M3.5, P2.1): count names the subgraph served that bigname omits or serves without `registered_at`; both apps now show no date for them.
6. `unsupported` inventory prevalence in the migration cohort (M2.5, P2.6).
7. Two `RegistrationGranted` rows per ENSv2 registration (P2.3, P3.7): confirm the display rule.
8. `subregistry` rows on ENSv1 names (P6.5): confirm their `contract_address` is the ENSv1 registry so the exclusion holds, and that no v1 name has more than 50 such rows.
9. `counts.roles` vs Panoptes `roleCount` (P6.1) on the Sepolia `eth` registry.
10. Resolver page after #954 deploys (P7.1, P7.3): the portal already reads `bound_names`; confirm it renders, and whether former nodes disappear.
11. `relations` subset on filtered reads (X6) on a `main` build.
12. Recent activity rows without `name` (P9.1): frequency and rendering.
13. Child-registration option on the deployed build (P3.7): confirm the membership redo has completed.
14. Registry-only subnames (M2.2): count Sepolia names in the migration cohort that the subgraph listed with `labelName: null` and bigname omits.
15. Lapsed ENSv2 reminders (W2.4): confirm on a Sepolia name in its 28-day grace that `GET /v1/names` returns no `owner`/`registrant`, and decide whether favourites-only is acceptable until section 7 item 2 lands.
16. Released ENSv2 rows on the portal list (P1.5) and the manager landing redirect (M4.2): confirm how a lapsed ENSv2 registration is listed for its former holder.
17. `permission` `powers` semantics (P7.4): grant a scoped role and read the row to see after-set or delta.
18. `unsupported` name detail on the manager (X3): find an `ensv2_exact_name_profile_shadow` name and check the search ("Registered") and profile (falls to the v1 chain read) outcomes are acceptable.
19. Post-write wait (P11.1): measure how far `indexed_block` on `/v1/status` trails the Sepolia head during normal operation, and whether it ever lags beyond the ~60 s bound, since awaited flows (records save, resolver links and roles) block that long before refreshing. Also confirm the head-block stand-in never targets a block past the write's own.
