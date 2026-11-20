import { namehash } from 'viem'
import type { V1Domain } from '../ensnode/ensnode.types'
import type { V1Context } from '../ensnode/names'
import type { NameRelation } from '../reads/common.types'
import type {
  NameSummary,
  NamesForAddressQuery,
} from '../reads/namesForAddress.types'
import type { SourcePage } from '../shared/merge'
import { isEth2ld, toUnixSeconds } from '../shared/values'
import type { V2Domain } from './zigens.types'

// ENSNode lists 1000 rows a page and takes 1000 names in `name_in`.
export const MAX_NAMES = 1000

// zigens fails a domain filter naming more than 32 names in all, though its schema says 1000.
export const ZIGENS_NAME_LIMIT = 32

const ALL_RELATIONS: readonly NameRelation[] = [
  'owner',
  'manager',
  'role_holder',
]

export const toRelations = (query: NamesForAddressQuery) =>
  query.relations?.length ? query.relations : ALL_RELATIONS

/** Whether `name` is a direct child of `parent`. */
export const isChildOf = (name: string, parent: string) =>
  name.endsWith(`.${parent}`) &&
  name.split('.').length === parent.split('.').length + 1

const V2_SORT = {
  name: 'name',
  expiry: 'expiryDate',
  registered: 'registrationDate',
  created: 'createdAt',
} as const

// The subgraph schema has no registration date on a domain; creation is closest.
const V1_SORT = {
  name: 'name',
  expiry: 'expiryDate',
  registered: 'createdAt',
  created: 'createdAt',
} as const

export const toOrder = (query: NamesForAddressQuery) => ({
  sort: query.sort ?? 'name',
  order: query.order ?? 'asc',
})

type Where = Readonly<Record<string, unknown>>

/** The text filter both schemas accept; `contains` wins over `prefix`. */
const toTextFilter = (query: NamesForAddressQuery): Where =>
  query.contains !== undefined
    ? { name_contains: query.contains }
    : query.prefix !== undefined
      ? { name_starts_with: query.prefix }
      : {}

/** `items` in runs of at most `size`. */
export const toBatches = <T>(
  items: readonly T[],
  size: number,
): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  )

/** The zigens terms, any of which makes an ENSv2 name the address's; the owner is also the manager in ENSv2. */
export const toV2Terms = (
  query: NamesForAddressQuery,
  roleNames: readonly string[],
): readonly Readonly<Record<string, unknown>>[] => {
  const address = query.address.toLowerCase()
  const relations = toRelations(query)
  return query.resolvesTo
    ? [{ resolvedAddress: address }]
    : [
        ...(relations.includes('owner') || relations.includes('manager')
          ? [{ owner: address }]
          : []),
        ...(relations.includes('role_holder')
          ? toBatches(roleNames, ZIGENS_NAME_LIMIT).map((names) => ({
              name_in: names,
            }))
          : []),
      ]
}

/** zigens filter for a page of ENSv2 names matching any of `terms`. */
export const toV2Variables = (
  query: NamesForAddressQuery,
  terms: readonly Readonly<Record<string, unknown>>[],
  after: string | undefined,
  pageSize: number,
) => {
  const anyOf = terms
  const { sort, order } = toOrder(query)
  return {
    where: {
      or: anyOf,
      ...toTextFilter(query),
      ...(query.migratedOnly && { isMigrated: true }),
      // Direct children are kept by `isChildOf` after the read.
      ...(query.parent && { name_ends_with: `.${query.parent}` }),
    },
    first: pageSize,
    after,
    orderBy: V2_SORT[sort],
    orderDirection: order,
  }
}

/** ENSNode filter for one page of ENSv1 names; null when no ENSv1 name can match. */
export const toV1Variables = (
  query: NamesForAddressQuery,
  skip: number,
  pageSize: number,
  { now, nameWrapper }: V1Context,
) => {
  if (query.migratedOnly) return null
  const address = query.address.toLowerCase()
  const relations = toRelations(query)
  // The wrapped owner both owns and manages while the NameWrapper holds the name; the registry owner manages, or owns an unwrapped subname.
  const anyOf = query.resolvesTo
    ? [{ resolvedAddress: address }]
    : [
        ...(relations.includes('owner') ? [{ registrant: address }] : []),
        ...(relations.includes('owner') || relations.includes('manager')
          ? [
              {
                and: [
                  { wrappedOwner: address },
                  { owner: nameWrapper.toLowerCase() },
                ],
              },
              { owner: address },
            ]
          : []),
      ]
  if (anyOf.length === 0) return null
  const { sort, order } = toOrder(query)
  // Held names only, as bigname lists them: the subgraph expiry of a `.eth` 2LD adds its grace, an unwrapped subname has none.
  const held = query.resolvesTo
    ? []
    : [
        {
          or: [
            { expiryDate_gt: toUnixSeconds(now).toString() },
            { expiryDate: null },
          ],
        },
      ]
  return {
    where: {
      and: [{ or: anyOf }, ...held],
      ...toTextFilter(query),
      ...(query.parent && { parent: namehash(query.parent) }),
    },
    first: pageSize,
    skip,
    orderBy: V1_SORT[sort],
    orderDirection: order,
  }
}

/** The value a source's server sorted a row by; merged pages compare these. */
export type SortKey = string | number | null

export type Sorted<Item> = Readonly<{ item: Item; key: SortKey }>

const toNumber = (value: number | string | null) =>
  value === null ? null : Number(value)

export const toV2SortKey = (
  domain: Pick<
    V2Domain,
    'name' | 'expiryDate' | 'registrationDate' | 'createdAt'
  >,
  query: NamesForAddressQuery,
): SortKey => {
  const field = V2_SORT[toOrder(query).sort]
  return field === 'name' ? domain.name : domain[field]
}

export const toV1SortKey = (
  domain: Pick<V1Domain, 'name' | 'expiryDate' | 'createdAt'>,
  query: NamesForAddressQuery,
): SortKey => {
  const field = V1_SORT[toOrder(query).sort]
  return field === 'name' ? domain.name : toNumber(domain[field])
}

// Nulls last ascending and first descending, as Postgres orders them.
const compareKeys = (a: SortKey, b: SortKey) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1

/** The order both sources were read in, to merge their pages by. */
export const toSortedComparator = (query: NamesForAddressQuery) => {
  const direction = toOrder(query).order === 'asc' ? 1 : -1
  return <Item>(a: Sorted<Item>, b: Sorted<Item>) =>
    direction * compareKeys(a.key, b.key)
}

/** A `.eth` name that lapsed in the window: expired or released, its expiry (an ENSv1 lease) after `since`. */
export const isLapsedInWindow = (
  summary: NameSummary,
  since: Date,
  now: Date,
): boolean =>
  (summary.registrationStatus === 'expired' ||
    summary.registrationStatus === 'released') &&
  summary.expiresAt !== null &&
  summary.expiresAt > since &&
  summary.expiresAt <= now &&
  isEth2ld(summary.name)

/** One page of rows already read in full, resumed by offset. */
export const toOffsetPage = <Item>(
  items: readonly Item[],
  after: string | undefined,
  pageSize: number,
): SourcePage<Item> => {
  const offset = Number(after ?? 0)
  const start = Number.isSafeInteger(offset) && offset > 0 ? offset : 0
  const rows = items.slice(start, start + pageSize)
  return {
    rows: rows.map((item, index) => ({
      item,
      after: String(start + index + 1),
    })),
    hasMore: start + rows.length < items.length,
    endCursor: rows.length > 0 ? String(start + rows.length) : null,
    totalCount: items.length,
  }
}
