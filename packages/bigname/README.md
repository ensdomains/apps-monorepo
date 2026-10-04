# @ens-apps/bigname

A typed `fetch` client for the bigname REST indexer (`/v1`). bigname serves
ENSv1, ENSv2 and Basenames from one API, so apps no longer need to merge
results from the ENSv1 subgraph and the Panoptes GraphQL indexer. The client
uses plain `fetch` and no React, so it runs in the browser, in TanStack Router
`beforeLoad`, in Cloudflare workerd and in Node. Wrap it in your own TanStack
Query hooks inside each app.

The types are written by hand from bigname's `docs/api-v1.md` and
`docs/api-v1-routes.md`, because bigname publishes no OpenAPI file. Field
names are the snake_case names the server sends.

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
client.listSubnames(name, { namespace, q, sort, order, include_expired, include: ['counts'], cursor, page_size })
                                                                → Page<SubnameRow>
client.getNameHistory(name, { namespace, scope, type, order, from_timestamp, to_timestamp,
                              include: ['data'|'raw'|'total_count'|'child_registrations'], cursor, page_size })
                                                                → Page<HistoryEvent>
client.getAddressHistory(address, { namespace, relation, scope, type, order, from_timestamp,
                                    to_timestamp, include: ['data'|'raw'|'total_count'], cursor, page_size })
                                                                → Page<HistoryEvent>
client.listEvents({ namespace, name, address, resolver: {chain_id, address} | 'chain:addr',
                    contract_address, registration_id, type, from_block, to_block,
                    from_timestamp, to_timestamp, order, include, cursor, page_size })
                                                                → Page<HistoryEvent>
client.listAddressNames(address, { namespace, relation: 'any' | AuthorityRelation[] | 'resolves_to',
                                   authority: 'ens_v0'|'ens_v1'|'ens_v2', is_migrated,
                                   coin_type: number | 'evm', q, sort, order,
                                   dedupe: 'name'|'registration', include: ['counts'|'role_summary'],
                                   cursor, page_size })
                                                                → Page<AddressNameRow>
client.getPrimaryName(address, { coin_type, namespace, source }) → { data: PrimaryName }
client.lookup({ inputs, profile: 'feed'|'detail', namespace, include: ['inventory'] })
                                                                → { data: LookupResult[] }
client.listNames({ namespace, expires_after and/or expires_before, sort, order, cursor, page_size })
                                                                → Page<NameListRow>   // expiry sweep
client.search({ q, match: 'prefix'|'contains', namespace, cursor, page_size })
                                                                → Page<NameListRow>
client.listPermissions({ name, registration_id, address, namespace, include: ['lineage'], cursor, page_size })
                                                                → PermissionsPage     // + restrictions?
client.getRegistry(chainId, address, { include: ['counts'], at, finality, cursor, page_size })
                                                                → { data: Registry } | null
client.listRegistryLabels(chainId, address, { include: ['counts'], cursor, page_size })
                                                                → Page<RegistryLabelRow>
client.getResolver(chainId, address, { at, finality, cursor, page_size })
                                                                → { data: ResolverOverview } | null
client.listResolverLinks(chainId, address, { at, finality, cursor, page_size })   → Page<ResolverLinkRow>
client.listResolverRoles(chainId, address, { at, finality, cursor, page_size })   → Page<ResolverRoleRow>
client.listResolverAliases(chainId, address, { at, finality, cursor, page_size }) → Page<ResolverAliasRow>
client.getNamespace(namespace)                                  → { data: NamespaceInfo }
```

Timestamp params (`at`, `from_timestamp`, `to_timestamp`, `expires_after`,
`expires_before`) accept an RFC 3339 string or a `Date`.

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

`MAX_PAGE_SIZE` is 200. Collections that read current state (names, subnames,
address names, permissions, registry labels, resolver collections) tie each
cursor to the index publication that was current when the cursor was issued.
If that publication has changed, the continuation answers `409 stale`, and
the pager starts again from the first page. `iteratePages` marks the first
page after a restart with `restarted: true`, so drop the rows you already
collected. `fetchAllPages` drops them for you. For `useInfiniteQuery`, catch
`isBignameError(e, 'stale')` on a `pageParam` fetch and reset the query.

### Errors and retries

`BignameError { status, code, message, details, url }`. `code` is one of
`invalid_input` (400), `not_found` (404), `unsupported` (422), `stale` (409),
`conflict` (409), `request_timeout` (408), `rate_limited` (429),
`overloaded` (503) or `internal_error` (500). `status` is `0` for a network
failure. Check with `isBignameError(error, code?)`.

The client retries 408, 429, 502, 503, 504 and network errors, up to 3
times, with backoff of 250 ms, then 500 ms, then 1 s (with jitter, never more
than 2 s, and following `Retry-After` when the server sends it). It also
retries `409 stale` for:

- single-resource reads,
- first pages, and
- history walks (name history, address history and events). History cursors
  stay valid when the index publishes, so the client resends the same cursor.

It does not retry `409 stale` on a current-state continuation, because that
cursor can no longer be used; the pager restarts instead. `409 conflict` is
never retried. An aborted `signal` rejects with the original `AbortError` and
is never retried.

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
parseTimestamp(rfc3339) → Date | undefined                // Z, +00:00, up to 9 fractional digits
timestampToSeconds(rfc3339) → number | undefined
secondsToTimestamp(seconds | bigint) → RFC 3339 UTC
grantsForAddress(roleSummary, address), powersForAddress(roleSummary, address)
hasAnyGrant(roleSummary, address), hasPower(roleSummary, address, power), isAdminPower(power)
isNameProfile(detail)          // false means status 'unsupported': identity fields only
isHistoryEventOfType(event, 'record')   // narrows event.data to that type's payload
isResolverAliasEvent(row)
buildQuery(params)             // drops absent values, joins lists with commas, percent-encodes values (so + becomes %2B)
```

All wire types (`NameDetail`, `NameProfile`, `NameRecords`, `RecordInventory`,
`AddressNameRow`, `HistoryEvent`, `LookupResult`, `PermissionRow`, `Restrictions`,
`Power`, `Meta`, `Page`, ...) are exported from the package root.

## Contract notes for migrators

- Name detail is a union. Check `isNameProfile(detail)` before you read any
  registration field. A `status: 'unsupported'` name has only identity fields
  and an `unsupported_reason`. A `404` means bigname has not indexed the name,
  and `getName` returns `null` for it.
- The records route no longer returns the flat `addresses`, `text_records` or
  `content_hash` maps (bigname #938). Use `records[key]` or
  `inventory.known_keys`. The flat maps are still returned by `getName` and
  by `lookup` with `profile: 'detail'`.
- `inventory.abi_content_types === null` means bigname does not know which
  ABI content types are set. It does not mean there are none; read
  `abi_unsupported_reason`. The items are decimal strings, so parse them with
  `BigInt`.
- The resolver overview has no counts and no samples (bigname #954), and it
  rejects `include`. Use the `/links`, `/roles` and `/aliases` collections,
  which return exact `total_count` values, and
  `listEvents({ resolver: { chain_id, address } })` for events.
- `restrictions` (the NameWrapper expiry `wrapper_expires_at`, or ENSv2
  `locked_roles`) is returned on `listAddressNames(..., { include: ['role_summary'] })`
  rows and at the top level of a `listPermissions` call made with `name` or
  `registration_id`. `getName` does not return it.
- An empty `role_summary`, or an empty permissions page, is not proof that no
  one holds roles on the name. When `meta.completeness` is `'partial'`, read
  `meta.unlisted_permission_surfaces` to see what is missing.
- `listAddressNames` returns an exact `page.total_count`. To count, use
  `page_size: 1` with `dedupe: 'name'` for names or `dedupe: 'registration'`
  for registrations. `listNames` and `resolves_to` reads always return
  `total_count: null`.
- To get a name's event count, call
  `getNameHistory(name, { page_size: 1, include: ['total_count'] })`.
- Timestamps can come back as `Z` or `+00:00`. Always parse them with
  `parseTimestamp`; never compare the strings.
- A `SubnameRow.name` can be a placeholder such as `[<labelhash>].parent.eth`.
  Never pass it back to a method that takes a name. Use `namehash` or
  `labelhash` as the row key.
