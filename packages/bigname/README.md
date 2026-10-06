# @ens-apps/bigname

Typed `fetch` client for BigName's `/v1` REST API, shared by Manager, Portal
and api-worker. It runs in browsers, Node and workerd without React; apps own
their TanStack Query hooks.

The branch requires a release combining BigName main and next, including
[PR 1094](https://github.com/ensdomains/bigname/pull/1094). Older deployments
are not supported. The historical `v041.mock.ts` and additional
`postV041.mock.ts` fixtures record provenance, not compatibility modes.

## Setup

Use the network configuration; blank base URLs throw.

```ts
import { createBignameClient } from '@ens-apps/bigname'
import { envConfig } from '@/config'

const bigname = createBignameClient({
  baseUrl: envConfig.endpoints.bignameApi,
})
```

Manager and Portal allow `VITE_BIGNAME_API_URL` to override the network URL.
The worker uses `getConfig(env).endpoints.bignameApi` without that override.
Client configuration also accepts `fetch`, `headers` and `retry`.

## Client and types

Use [client.ts](src/client.ts) for method signatures and parameters,
[types.ts](src/types.ts) for wire shapes, and [index.ts](src/index.ts) for
exports. The upstream contract is BigName's `docs/api-v1.md`,
`docs/api-v1-routes.md` and `apps/api/openapi.json`.

Methods cover names/records, lookup/search, address names and primary names,
history/events, permissions, registries, resolvers, namespace and status.
They return `{ data, meta }` or collection `{ data, page, meta }` envelopes
and take optional request options including `signal`. Failures reject with
`BignameError`; nullable resource methods return `null` on 404.
Collection 404s reject unless wrapped with `nullOnNotFound`.

Lookup batches up to 1,000 inputs using `profile: 'detail'` or `'feed'`.
It accepts no `include`. Feed records omit ownership, authority and record
inventory; use detail when those fields are needed.

## Pagination and failures

```ts
const { rows, truncated } = await fetchAllPages(
  (cursor) => bigname.listAddressNames(address, {
    relation: 'any',
    sort: 'name',
    page_size: MAX_PAGE_SIZE,
    cursor,
  }),
  { signal },
)

if (truncated) throw new Error('Incomplete name inventory')
```

`MAX_PAGE_SIZE` is 200. `fetchAllPages` defaults to 100 pages, 10,000 rows
and three stale-continuation restarts. Set both `maxPages` and `maxRows`
to `Infinity` only for intentionally uncapped reads. Propagate cancellation
and handle `truncated`; a bounded result cannot prove absence.

`iteratePages` marks the first page after a restart with `restarted: true`;
discard earlier rows. `fetchAllPages` does this automatically. Its opt-in
`allowPartial` can retain successful pages after a transient continuation
failure, returning `partialError`; it never retains an invalidated snapshot.
Returned `meta` is from the final page, so collection-specific consumers must
preserve earlier partial/unsupported coverage themselves.

`BignameError` exposes `status`, `code`, `message`, `details` and `url`;
use `isBignameError(error, code?)`. Status 0 denotes a network failure.
The client retries network errors, 408/429/502/503/504, `409 stale` and
unpinned `409 conflict` up to three times with jittered backoff and
`Retry-After` support. It does not retry 500, pinned conflicts or aborts.
Pinned resolver continuations skip stale retries and let the pager restart.

`fetchRoleSummaryPage` retries an overflowing role-summary cursor at smaller
page sizes, then omits roles only for a single overflowing row.
`fetchV2GraceNames` reads former owners to recover ENSv2 `.eth` names still
in grace. See the [request-count comparison](../../docs/bigname-request-counts.md)
for these costs.

## Semantics consumers must preserve

| Subject | Rule |
| --- | --- |
| Timestamps | Responses use decimal Unix-second strings. Use `timestampToBigInt` for exact comparison; large expiries exceed JS safe integers. Request timestamp parameters also accept RFC 3339 or `Date`. |
| Missing data | 404, supported empty, partial and unsupported are different states. Check `isNameProfile` before reading registration fields. |
| Ownership | `owner` is the token holder, otherwise registry owner. `manager` controls the registry record and can be absent in grace or unknown wrapper state. `former_owner` is separate from `any`; released names carry `lapsed_registration.owner`. |
| ENSv1 dates | `ens_v1.expires_at` is the lease. After cutover, top-level expiry may be the ENSv2 reservation instead. Select the deadline appropriate to the operation: lease grace is 90 days; reservation/ENSv2 grace is 28. |
| Wrapper expiry | Use `readWrapperExpiry` on `ens_v1` or wrapper restrictions. Do not derive it from lease +90 days. Undefined means not served; classified null carries `no_expiry` or `not_set`. |
| Record inventory | `seen_*` lists known keys. A missing map value is unknown; null means cleared **at the indexed snapshot**. Neither substitutes for a fresh on-chain value when copying records. |
| Permission coverage | Empty rows do not prove no grants. Honor `meta.completeness` and `unlisted_permission_surfaces`. Descriptive `record_resource` is not a substitute for an exact numeric EAC target. |
| Counts | Null is unknown, not zero. Request `include: ['total_count']` when needed on address authority relations; that scan can time out. It is unsupported for `resolves_to` and `former_owner`. |
| History | `include=data` adds selected fields; `include=raw` adds the normalized kind, not the original log. A broad event type does not prove a specific contract action. |
| Name identity | Labelhash placeholders are valid inputs. A residual child without a proven name record can still 404; key rows by namehash. |

For an address's owned `.eth` registrations, use
`relation=owner&parent=eth&dedupe=registration&include=total_count`.
Without `parent`, owner counts also include subnames and registry children.
History totals use `include=total_count` on the history page. Resolver overview
has no exact node total; a page length is only a lower bound when more follow.

## Required release capabilities

Verify these on the deployed combination of main/next, after required replay:

- Exact `ens_v1.wrapper_expires_at` and classified-null reasons on supported
  name rows, including lapsed wrapper state.
- Exact-count requests on address authority relations. Counts can otherwise
  be null above the candidate threshold; do not probe an older API first.
- `listPermissions({ registry })` for root-resource holders and
  `RootPermissionChanged` in global/address history. Root rows have no name;
  ordinary name history does not include them.
- Event-local token/canonical IDs and payment/operator detail where supported.
  Monetary amounts are integer strings; use token units, and count repeated
  `registered`/`linked` charges sharing an `action_id` once.
- Current versioned ENSv2 `token_id` on name detail/lookup. It can change on
  regeneration while `registration_id` stays stable.
- Correct locked-role restrictions, including root administrators and the
  registration-specific transfer exception.
- Name/detail/lookup support for proven registry children, including valid
  unknown-label placeholders. A held child may be `registered` without a lease.

Known gaps and consumer behavior belong in the
[migration summary](../../docs/bigname-output-differences.md), not this API guide.
