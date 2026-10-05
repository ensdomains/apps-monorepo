# @ens-apps/bigname

A typed `fetch` client for the bigname REST indexer (`/v1`). bigname serves
ENSv1, ENSv2 and Basenames from one API, so apps no longer need to merge
results from the ENSv1 subgraph and the Panoptes GraphQL indexer. The client
uses plain `fetch` and no React, so it runs in the browser, in TanStack Router
`beforeLoad`, in Cloudflare workerd and in Node. Wrap it in your own TanStack
Query hooks inside each app.

The types follow the bigname **v0.4.1** contract (`docs/api-v1.md`,
`docs/api-v1-routes.md` and the generated `apps/api/openapi.json`, also served
at `<baseUrl>/openapi.json`) plus the additive shapes merged on bigname `main`
after it. The deployed API is still v0.4.1, so the client works against both:
see [After v0.4.1](#after-v041). Field names are the snake_case names the
server sends. `src/v041.mock.ts` holds real v0.4.1 responses and
`src/postV041.mock.ts` hand-written ones in the newer shapes; both typecheck
against these types with `satisfies`.

## Configuration

The base URL is required and comes from `@ens-apps/config`, which resolves it
per network (`NETWORKS[network].endpoints.bignameApi`) and fails the build when
a network has no deployment.

| App | Source | Override |
| --- | --- | --- |
| apps/manager, apps/portal | `envConfig.endpoints.bignameApi` (`@/config`) | `VITE_BIGNAME_API_URL` |
| workers/api-worker | `getConfig(env).endpoints.bignameApi` | none: the network profile only |

```ts
import { createBignameClient } from '@ens-apps/bigname'
import { envConfig } from '@/config'

const bigname = createBignameClient({
  baseUrl: envConfig.endpoints.bignameApi,
})
```

`createBignameClient` throws on a blank base URL.

## API

Every method returns a Promise and takes an optional last argument
`{ signal?: AbortSignal }`. Single-resource methods resolve to
`{ data, meta }`. Collection methods resolve to `{ data, page, meta }`.
Failures reject with `BignameError`.

```ts
createBignameClient(config: {
  baseUrl: string
  fetch?: typeof fetch
  retry?: { retries?: number; baseDelayMs?: number; maxDelayMs?: number } | false
  headers?: Record<string, string>
}): BignameClient

client.baseUrl: string
client.request<TEnvelope>({ method?, path, query?, body?, retryStale?, signal? })  // escape hatch

client.getStatus()                                              → { data: Status }
client.getName(name, { namespace, at, finality, source, include: ['counts'] })
                                                                → { data: NameDetail } | null   // null on 404
client.getNameRecords(name, { namespace, at, finality, source: 'indexed'|'verified'|'auto',
                              keys: string[], include: ['inventory'] })
                                                                → { data: NameRecords } | null  // null on 404
client.listSubnames(name, { namespace, q, match: 'prefix'|'contains', sort, order, include_expired,
                            include: ['counts'], cursor, page_size })
                                                                → Page<SubnameRow>
client.getNameHistory(name, { namespace, scope, type, exclude_type, kind, record_key, order,
                              from_timestamp, to_timestamp,
                              include: ['data'|'raw'|'total_count'|'child_registrations'], cursor, page_size })
                                                                → Page<HistoryEvent>
client.getAddressHistory(address, { namespace, relation: 'any' | AuthorityRelation | AuthorityRelation[],
                                    scope, type, exclude_type, kind, record_key, order, from_timestamp,
                                    to_timestamp, include: ['data'|'raw'|'total_count'], cursor, page_size })
                                                                → Page<EventRow>
client.listEvents({ namespace, name, address, resolver: {chain_id, address} | 'chain:addr',
                    contract_address, registration_id, type, exclude_type, kind, record_key,
                    from_block, to_block, from_timestamp, to_timestamp, order, include, cursor, page_size })
                                                                → Page<EventRow>
client.listAddressNames(address, { namespace,
                                   relation: 'any' | AuthorityRelation | AuthorityRelation[] | 'resolves_to' | 'former_owner',
                                   authority: Authority | Authority[], parent, is_migrated,
                                   coin_type: number | 'evm', expires_after, expires_before,
                                   q, match, sort: 'name'|'expires_at'|'registered_at'|'created_at', order,
                                   dedupe: 'name'|'registration',
                                   include: ['counts'|'role_summary'|'total_count'],
                                   cursor, page_size })
                                                                → Page<AddressNameRow>
client.getPrimaryName(address, { coin_type, namespace, source }) → { data: PrimaryName }
client.lookup({ inputs, profile?: 'feed'|'detail', namespace })  → { data: LookupResult<profile>[] }
client.listNames({ namespace, expires_after and/or expires_before, authority, parent,
                   sort, order, cursor, page_size })
                                                                → Page<NameListRow>   // expiry sweep
client.search({ q, match: 'prefix'|'contains', namespace, cursor, page_size })
                                                                → Page<NameListRow>
client.listPermissions({ name, registration_id, address, registry: {chain_id, address} | 'chain:addr',
                         namespace, include: ['lineage'], cursor, page_size })
                                                                → PermissionsPage     // + restrictions?
client.getRegistry(chainId, address, { include: ['counts'], at, finality, cursor, page_size })
                                                                → { data: Registry } | null
client.listRegistryLabels(chainId, address, { include: ['counts'], owner | exclude_owner, cursor, page_size })
                                                                → Page<RegistryLabelRow>
client.getResolver(chainId, address, { at, finality, cursor, page_size })
                                                                → { data: ResolverOverview } | null
client.listResolverLinks(chainId, address, { at, finality, cursor, page_size })   → Page<ResolverLinkRow>
client.listResolverRoles(chainId, address, { at, finality, cursor, page_size })   → Page<ResolverRoleRow>
client.getNamespace(namespace)                                  → { data: NamespaceInfo }
```

`AuthorityRelation` is `owner | manager | role_holder` (`registrant` was
removed in bigname v0.3.0 and answers 400). Lookup reverse inputs take
`relation: 'any' | 'owner' | 'manager' | 'owner,manager' | 'resolves_to'`.

Timestamp params (`at`, `from_timestamp`, `to_timestamp`, `expires_after`,
`expires_before`) accept decimal Unix seconds (`number`, `bigint` or a digit
string), an RFC 3339 string, or a `Date` (sent as RFC 3339).

### Paging

```ts
iteratePages(fetchPage: (cursor?: string) => Promise<Page>, { maxPages = 100, maxRestarts = 3, signal })
  → AsyncGenerator<Page & { restarted: boolean }>
fetchAllPages(fetchPage, { maxPages = 100, maxRows = 10_000, maxRestarts = 3, signal })
  → { rows, page, meta, truncated }

const { rows, truncated } = await fetchAllPages((cursor) =>
  bigname.listAddressNames(address, { relation: 'any', sort: 'name', page_size: MAX_PAGE_SIZE, cursor }),
)
```

`MAX_PAGE_SIZE` is 200. Every bigname cursor holds only its sort position and
filters, not an index publication, so a page that answers `409 stale` is
retried with the same cursor and continues. The one exception is a resolver
collection pinned with `at`: once a later block is published, its
continuation stays stale, and the pager starts again from the first page.
`iteratePages` marks the first page after a restart with `restarted: true`, so
drop the rows you already collected. `fetchAllPages` drops them for you.

### Errors and retries

`BignameError { status, code, message, details, url }`. `code` is one of
`invalid_input` (400), `not_found` (404), `unsupported` (422), `stale` (409),
`conflict` (409), `request_timeout` (408), `rate_limited` (429),
`overloaded` (503) or `internal_error` (500). `status` is `0` for a network
failure. Check with `isBignameError(error, code?)`.

`isUnknownQueryParamError(error, 'registry')` and
`isUnsupportedIncludeError(error, 'total_count')` are true only for the `400`
a deployment answers when it predates that parameter or `include` value, so
you can fall back instead of failing.

The client retries 408, 429, 502, 503, 504, network errors and `409 stale`,
up to 3 times, with backoff of 250 ms, then 500 ms, then 1 s (with jitter,
never more than 2 s, and following `Retry-After` when the server sends it).
It does not retry `409 stale` on a resolver continuation pinned with `at`.
`409 conflict` is never retried. An aborted `signal` rejects with the
original `AbortError` and is never retried.

A `404` from a collection (for example subnames or history of a name bigname
has not indexed) rejects with `not_found`. Wrap the call in
`nullOnNotFound(promise)` if "not indexed" is a normal answer for you.

### Helpers

```ts
textKey('avatar') → 'text:avatar'      addrKey(60) → 'addr:60'
CONTENTHASH_KEY, AVATAR_KEY, ETH_COIN_TYPE (60), DEFAULT_EVM_COIN_TYPE (2147483648)
parseRecordKey(key) → { kind: 'text', key } | { kind: 'addr', coinType } | { kind: 'contenthash' } | { kind: 'avatar' } | undefined
isRecordKey(key), isEvmCoinType(coinType)
getRecordValue(records, key) → string | undefined        // only for status 'ok'
isOkRecordAnswer(answer)
parseTimestamp(ts) → Date | undefined          // decimal Unix seconds; undefined past year 275760
timestampToSeconds(ts) → number | undefined    // undefined above Number.MAX_SAFE_INTEGER
timestampToBigInt(ts) → bigint | undefined     // exact for every served value
readWrapperExpiry(ensV1 | wrapperRestrictions)
  → { expiresAt: bigint } | { expiresAt: null, reason: 'no_expiry'|'not_set' } | undefined   // undefined: not served
secondsToTimestamp(seconds | bigint | Date) → decimal-seconds string
grantsForAddress(roleSummary, address), powersForAddress(roleSummary, address)
hasAnyGrant(roleSummary, address), hasPower(roleSummary, address, power), isAdminPower(power)
isNameProfile(record)          // name detail or lookup detail; false means status 'unsupported'
isHistoryEventOfType(event, 'record')   // HistoryEvent or EventRow; narrows event.data
buildQuery(params)             // drops absent values, joins lists with commas, percent-encodes values (so + becomes %2B)
```

All wire types (`NameDetail`, `NameProfile`, `RecordGroups`, `EnsV1`,
`NameRecords`, `AddressNameRow`, `HistoryEvent`, `EventRow`, `LookupResult`,
`PermissionRow`, `Restrictions`, `Power`, `Meta`, `Page`, ...) are exported
from the package root.

## Contract notes (bigname v0.4.1)

- Every timestamp is a decimal string of Unix seconds (`"1803965433"`).
  Expiries can exceed `2^53`; compare with `timestampToBigInt`. A classified
  absent expiry is `expires_at: null` with `expires_at_reason`
  (`no_expiry`, `not_set`, `released`) and `grace_ends_at: null`.
- Name detail is a union. Check `isNameProfile(detail)` before you read any
  registration field. A `404` means bigname has not indexed the name, and
  `getName` returns `null` for it.
- `owner` is the token holder (BaseRegistrar, NameWrapper or ENSv2 token),
  else the registry owner. `manager` can change the registry record; it is
  omitted while a wrapped `.eth` 2LD is in registrar grace, on released names
  and where the NameWrapper state is unknown. Released names have neither;
  the last holder is `lapsed_registration.owner` and the
  `relation=former_owner` listing. `registrant` exists only in history
  `registration` payloads.
- While `authority` is `ens_v1` or `ens_v0`, name rows carry
  `ens_v1: { expires_at, wrapper_state?, wrapper_fuses? }`. From the Universal
  Resolver cutover (`getNamespace` → `networks[].resolution`), a `.eth` name
  with a live ENSv2 entry serves that entry's expiry at the top level (grace
  +28 days) and the ENSv1 lease date as `ens_v1.expires_at` (grace +90 days).
  Read "renewable until" from `grace_ends_at`; do not add grace yourself.
- Name detail and lookup `profile=detail` carry grouped `records`
  (`seen_addresses`/`addresses`, `seen_texts`/`texts`, `seen_abis` or
  `abi_unsupported_reason`, `seen_singletons`, `contenthash`, `name`). A seen
  key absent from its map is unknown; `null` means cleared. The records route
  keeps per-key answers and `include=inventory`.
- Lookup `profile=feed` records carry identity, `chain_id`, `network`,
  `status`, `subregistry`, and `expires_at`, `expires_at_reason`,
  `grace_ends_at`, `ens_v1`; no `owner`, `manager`, `authority` or `records`.
  `lookup` takes no `include` (400).
- ENSv2 registry role changes are `permission` history rows
  (`kind: 'PermissionChanged'`, `grant_scope.kind: 'registry'`) with
  `powers`, `added_powers` and `removed_powers`, including those on the root
  registry's TLD tokens. Registry-wide root-resource role changes
  (`RootPermissionChanged`) are not served on any product history route.
- `restrictions` (the NameWrapper expiry `wrapper_expires_at`, or ENSv2
  `locked_roles`) is returned on `listAddressNames(..., { include: ['role_summary'] })`
  rows and at the top level of a `listPermissions` call made with `name` or
  `registration_id`. `getName` does not return it.
- An empty `role_summary`, or an empty permissions page, is not proof that no
  one holds roles on the name. When `meta.completeness` is `'partial'`, read
  `meta.unlisted_permission_surfaces` to see what is missing.
- `listAddressNames` returns an exact `page.total_count` on authority
  relations. The `.eth` registrations an address holds:
  `{ relation: 'owner', parent: 'eth', dedupe: 'registration', page_size: 1 }`.
  `relation: 'owner'` without `parent` also counts tokenless subnames and
  registry children. `listNames`, `resolves_to` and `former_owner` reads
  return `total_count: null`.
- To get a name's event count, call
  `getNameHistory(name, { page_size: 1, include: ['total_count'] })`.
- A label spelled `[<64 lowercase hex>]` is its labelhash and is a valid name
  input on every name-shaped route. A `SubnameRow.name` such as
  `[<labelhash>].parent.eth` can still 404 when the child has no name row;
  key rows by `namehash`.
- The resolver overview has no counts and its `bound_names.page.total_count`
  is `null`. The `/aliases` route was removed (bigname v0.1.0).

## After v0.4.1

These shapes are merged on bigname `main` (#1073 to #1084) and not deployed.
Every new response field is optional in the types, and no new request
parameter is sent unless you pass it. Against v0.4.1 the fields are absent
and the parameters answer `400 invalid_input`.

- `ens_v1.wrapper_expires_at` (with `wrapper_expires_at_reason` when `null`)
  is the NameWrapper entry's own expiry, on every name-shaped row. It is not
  the lease plus 90 days and can be earlier than `ens_v1.expires_at`. It is
  present beside `wrapper_state`, and alone and in the past once an
  emancipated or locked wrapper has lapsed. It is omitted for an unwrapped
  name and for a registry child with no name row, so absence proves nothing.
  Read it with `readWrapperExpiry`, which also reads wrapper `restrictions`.
- `listPermissions({ registry })` lists the holders of an ENSv2 registry's
  root resource, and with `address` one account's root row. It cannot be
  combined with `name` or `registration_id`. Root rows have
  `grant_scope: { kind: 'root', detail: { registry } }`, no `name` and no
  top-level `restrictions`. For a registry that discovery admitted,
  `meta.completeness` is `'partial'` with
  `unlisted_permission_surfaces: ['ens_v2_registry_operators']`, on an empty
  page too. An unknown registry is an empty page, not a 404. v0.4.1 rejects
  the parameter: check `isUnknownQueryParamError(error, 'registry')`. Root
  rows that v0.4.1 serves on `address` reads carry `detail: {}`.
- Registry root role changes are `permission` history rows with
  `kind: 'RootPermissionChanged'` and `grant_scope.kind: 'root'`, on
  `listEvents` and on the subject's `getAddressHistory`, never on name
  history. They have no `name`, a `null` `registration_id`, and `powers`,
  `added_powers` and `removed_powers`. This replaces the v0.4.1 note above
  that these rows are not served.
- History `include: ['data']` adds `token_id` (ENSv2 `registration`,
  `transfer` and non-root `permission` rows: the token at that event, not
  the current one), `canonical_id` (ENSv2 rows of every type except
  `authority`, `record`, `primary_name` and `migration`), `cost`,
  `payment_token` and `referrer` (`registration` and `renewal`), `base_cost`
  and `premium` (`registration`), and `operator` (ERC-1155 `transfer`).
  Amounts are decimal strings: wei for ENSv1, raw `payment_token` units for
  ENSv2. The `registered` and `linked` rows of one `action_id` can both
  carry the same payment; count it once.
- `token_id` on name detail and lookup is, for ENSv2, the versioned ERC-1155
  token of the current registration. It is omitted without a current
  registration, and changes when the token regenerates while
  `registration_id` does not.
- `restrictions.locked_roles` counts admins on the registry root as well as
  on the registration, except for `transfer`, which only
  `can_transfer_admin` on the registration itself unlocks.
- `listAddressNames` returns `page.total_count: null` on authority relations
  for an address with more than 1,000 candidate names (counted before
  filters) unless you pass `include: ['total_count']`. Send it on the first
  page only; it reads every candidate and can time out on very large
  addresses. It is rejected with `relation: 'resolves_to'` and
  `'former_owner'`, and by v0.4.1, which always counts exactly without it:
  check `isUnsupportedIncludeError(error, 'total_count')`.
