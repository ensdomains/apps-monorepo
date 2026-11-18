import type { ResolverPower } from '@ens-apps/indexer/bigname'
import {
  type AuditedPage,
  type BoundName,
  type Completeness,
  type HistoryEvent,
  type ResolverOverview as IndexedResolverOverview,
  IndexerReadError,
  type Page,
  type RecordResource,
  type ResolverLink as ResolverLinkRow,
  type ResolverRoleGrant,
  readAllItems,
  retryStaleRead,
} from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import {
  resultInfiniteQueryOptions,
  resultQueryOptions,
} from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { QueryClient } from '@tanstack/react-query'
import { errAsync, ok, okAsync, Result, ResultAsync } from 'neverthrow'
import { match, P } from 'ts-pattern'
import type { Address } from 'viem'
import {
  fetchResolverEventsPage,
  timelinePageParams,
} from '@/features/history/timelineEventPage'
import { indexer } from '@/lib/indexer'
import {
  encodeResolverRoleBitmap,
  type ResolverRole as ResolverRoleName,
} from '@/lib/roles/resolverRoles'
import { flattenHistoryData } from '@/utils/history/historyEventsToTableEvents'
import { NODES_WITH_RECORDS } from './useNodesWithRecords'
import { RESOLVER_ROLES_FOR_ACCOUNT } from './useResolverCallerAdminRoles'

/**
 * A name that shares its record with at least one other name on this resolver.
 *
 * Records are internal inodes: a setter creates one and links the name to it,
 * and `linkToNode` points a second name at the same `recordId`. So a link is
 * not a stored `from -> to` pair, it is two names resolving to one record —
 * the indexer's links rows, grouped by `recordId`.
 */
export type ResolverLink = {
  readonly name: string
  readonly namehash: string
  readonly recordId: string
  /** The other names on the same record. */
  readonly sharedWith: readonly string[]
}

/** A resource preimage, decoded from a role's `record_resource`, for labelling scopes. */
export type ResolverNamedResource = {
  readonly resource: string
  readonly recordKind: string | null
  readonly recordKey: string | null
  readonly coinType: string | null
}

export type ResolverRole = {
  readonly account: string
  /** EAC resource as a decimal string; null when the API does not identify it. */
  readonly resource: string | null
  /** Opaque permission handle, never an EAC resource to send to the contract. */
  readonly registrationId?: string
  /** The held powers, re-encoded as the resolver's role bitmap. */
  readonly roleBitmap: string
  readonly blockNumber: number
  readonly transactionHash: string | null
  readonly timestamp: number | null
  readonly name: string | null
}

export type ResolverEvent = {
  readonly id: string
  /** The raw storage kind, else the indexer's friendly type. */
  readonly type: string
  readonly blockNumber: number
  readonly timestamp: number | null
  readonly transactionHash: string | null
  /** The decoded payload, JSON-encoded and flat. */
  readonly data: string
}

export type ResolverNode = {
  readonly id: string
  readonly name: string
  readonly owner: { readonly id: string } | null
  readonly resolver: { readonly id: string; readonly address: string } | null
}

export type ResolverOverview = {
  readonly address: string
  /**
   * Names whose current registration declares this resolver: the indexer's
   * count when it gives one, else the first page's length, a lower bound
   * while `nodeCountIsLowerBound` (shown as "N+"). Null when the indexer
   * could not serve the bound names.
   */
  readonly nodeCount: number | null
  readonly nodeCountIsLowerBound: boolean
  /**
   * Set on an ENSv1 mirror resolver: it answers through this ENSv1 registry's
   * resolvers, which count those names, so its own node count stays small.
   */
  readonly mirrorRegistry: string | null
  readonly linkCount: number | null
  readonly linksStatus: Completeness
  readonly rolesStatus: Completeness
  /** Distinct accounts holding a resolver-scoped role. */
  readonly roleHolderCount: number | null
  readonly links: readonly ResolverLink[]
  readonly namedResources: readonly ResolverNamedResource[]
  readonly roles: readonly ResolverRole[]
  /**
   * The newest events (see `RESOLVER_EVENTS_PAGE_SIZE`), newest first; null
   * when the indexer could not serve them, which leaves the rest of the page up.
   */
  readonly events: readonly ResolverEvent[] | null
  /** True when the indexer holds older events than `events` lists. */
  readonly eventsHasMore: boolean
}

class GetResolverOverviewError extends TaggedError('GetResolverOverviewError')<{
  cause: IndexerReadError
}> {}

type GetResolverOverviewParameters = {
  address: Address
}

export type LinkedName = {
  readonly name: string
  readonly namehash: string
  readonly recordId: string
}

/** Names sharing a `recordId` are linked; a record with one name is not. */
export const toLinks = (
  entries: readonly LinkedName[],
): readonly ResolverLink[] => {
  const byRecord = new Map<string, LinkedName[]>()
  for (const linked of entries) {
    const existing = byRecord.get(linked.recordId)
    if (existing) existing.push(linked)
    else byRecord.set(linked.recordId, [linked])
  }

  const links: ResolverLink[] = []
  for (const group of byRecord.values()) {
    if (group.length < 2) continue
    for (const linked of group) {
      links.push({
        name: linked.name,
        namehash: linked.namehash,
        recordId: linked.recordId,
        sharedWith: group
          .filter((other) => other.name !== linked.name)
          .map((other) => other.name),
      })
    }
  }
  return links
}

/**
 * The links remaining after `sourceName` is unlinked. A link is a view over a
 * shared-record group, so the unlinked name leaves every group it appeared in,
 * and any row left sharing with nobody is no longer a link at all.
 */
export const pruneLinksAfterUnlink = (
  links: readonly ResolverLink[],
  sourceName: string,
): ResolverLink[] =>
  links
    .filter((link) => link.name !== sourceName)
    .map((link) => ({
      ...link,
      sharedWith: link.sharedWith.filter((other) => other !== sourceName),
    }))
    .filter((link) => link.sharedWith.length > 0)

/** Bound names counted on the overview; a fuller resolver reads as this many plus. */
const OVERVIEW_NODES_PAGE_SIZE = 100
/** Events listed; a busy resolver's full feed is its events read, paged. */
const RESOLVER_EVENTS_PAGE_SIZE = 200
/** Rows per page of the links and roles collections. */
const COLLECTION_PAGE_SIZE = 200

/**
 * A links row as a named link. The resolver's default record (the empty-name
 * node) and a node the indexer has never seen a name for have no name to link
 * or unlink by, so they are left out.
 */
const toLinkedName = (row: ResolverLinkRow): LinkedName[] =>
  row.isDefault || !row.name
    ? []
    : [{ name: row.name, namehash: row.namehash, recordId: row.recordId }]

/**
 * bigname's power names for a `PermissionedResolver` role, mapped onto the
 * role names its bitmap is built from. `set_pubkey`, `set_alias` and
 * `clear_records` have no bit on this resolver generation.
 */
const RESOLVER_ROLE_BY_POWER: Readonly<
  Record<ResolverPower, ResolverRoleName>
> = {
  set_addr: 'ROLE_SET_ADDRESS',
  set_text: 'ROLE_SET_TEXT',
  set_contenthash: 'ROLE_SET_CONTENTHASH',
  set_abi: 'ROLE_SET_ABI',
  set_interface: 'ROLE_SET_INTERFACE',
  set_name: 'ROLE_SET_NAME',
  set_data: 'ROLE_SET_DATA',
  link: 'ROLE_LINK',
  can_name: 'ROLE_CAN_NAME',
  upgrade: 'ROLE_UPGRADE',
  admin_set_addr: 'ROLE_SET_ADDRESS_ADMIN',
  admin_set_text: 'ROLE_SET_TEXT_ADMIN',
  admin_set_contenthash: 'ROLE_SET_CONTENTHASH_ADMIN',
  admin_set_abi: 'ROLE_SET_ABI_ADMIN',
  admin_set_interface: 'ROLE_SET_INTERFACE_ADMIN',
  admin_set_name: 'ROLE_SET_NAME_ADMIN',
  admin_set_data: 'ROLE_SET_DATA_ADMIN',
  admin_link: 'ROLE_LINK_ADMIN',
  admin_can_name: 'ROLE_CAN_NAME_ADMIN',
  admin_upgrade: 'ROLE_UPGRADE_ADMIN',
}

const isResolverPower = (power: string): power is ResolverPower =>
  Object.hasOwn(RESOLVER_ROLE_BY_POWER, power)

export const powersToResolverRoleBitmap = (powers: readonly string[]): bigint =>
  encodeResolverRoleBitmap(
    powers.flatMap((power) =>
      isResolverPower(power) ? [RESOLVER_ROLE_BY_POWER[power]] : [],
    ),
  )

/** An `argument` resource arrives as its first setter, under the argument's own hash. */
const toNamedResource = (resource: RecordResource): ResolverNamedResource => {
  const base = { resource: BigInt(resource.hash).toString() }
  return match(resource)
    .returnType<ResolverNamedResource>()
    .with({ kind: 'address' }, (address) => ({
      ...base,
      recordKind: 'addr',
      recordKey: null,
      coinType: address.coinType?.toString() ?? null,
    }))
    .with({ kind: P.union('text', 'data') }, (keyed) => ({
      ...base,
      recordKind: keyed.kind,
      recordKey: keyed.key,
      coinType: null,
    }))
    .with({ kind: 'abi' }, (abi) => ({
      ...base,
      recordKind: 'ABI content type',
      recordKey: abi.contentType?.toString() ?? null,
      coinType: null,
    }))
    .with({ kind: 'interface' }, (iface) => ({
      ...base,
      recordKind: 'interface',
      recordKey: iface.interfaceId,
      coinType: null,
    }))
    .exhaustive()
}

const namedResourceOf = (grant: ResolverRoleGrant) =>
  grant.recordResource ? [toNamedResource(grant.recordResource)] : []

/**
 * The EAC resource a grant targets: the indexer's EAC resource when it serves
 * one, else the hash of the record it is scoped to. Neither present does not
 * prove root, so the scope stays unknown and no write can target 0 by
 * inference. The registration handle is opaque and cannot recover it.
 */
const resourceOf = (grant: ResolverRoleGrant): string | null =>
  grant.eacResource ??
  (grant.recordResource ? BigInt(grant.recordResource.hash).toString() : null)

const toUnixSeconds = (date: Date | null | undefined): number | null =>
  date ? Math.floor(date.getTime() / 1000) : null

const toResolverRole = (grant: ResolverRoleGrant): ResolverRole => ({
  account: grant.account,
  resource: resourceOf(grant),
  registrationId: grant.registrationId ?? undefined,
  roleBitmap: powersToResolverRoleBitmap(grant.powers).toString(),
  blockNumber: grant.grantedAt?.blockNumber ?? 0,
  transactionHash: grant.grantedAt?.transactionHash ?? null,
  timestamp: toUnixSeconds(grant.grantedAt?.timestamp),
  name: grant.name,
})

/** A bound name as a node; every bound name's current resolver is this one. */
const toResolverNode =
  (resolver: { readonly address: string }) =>
  (bound: BoundName): ResolverNode => ({
    id: bound.namehash,
    name: bound.name,
    owner: bound.owner ? { id: bound.owner } : null,
    resolver: { id: resolver.address, address: resolver.address },
  })

/** A row the indexer derived from state has no transaction to show. */
const toResolverEvent = (row: HistoryEvent): ResolverEvent[] =>
  row.blockNumber === null || row.transactionHash === null
    ? []
    : [
        {
          id: row.id,
          type: row.kind ?? row.type,
          blockNumber: row.blockNumber,
          timestamp: toUnixSeconds(row.timestamp),
          transactionHash: row.transactionHash,
          data: JSON.stringify(flattenHistoryData(row.data)),
        },
      ]

type ResolverRef = { readonly address: Address }

const resolverRefOf = (address: Address): ResolverRef => ({
  address: address.toLowerCase() as Address,
})

const COMPLETENESS_RANK: Readonly<Record<Completeness, number>> = {
  full: 0,
  partial: 1,
  unsupported: 2,
}

const weaker = (a: Completeness, b: Completeness): Completeness =>
  COMPLETENESS_RANK[b] > COMPLETENESS_RANK[a] ? b : a

type Collection<T> = {
  readonly rows: readonly T[]
  readonly status: Completeness
}

/** Every page of a resolver collection, with the weakest completeness any page stated. */
const readResolverCollection = <T>(
  read: (
    cursor: string | undefined,
    signal?: AbortSignal,
  ) => ResultAsync<AuditedPage<T>, IndexerReadError>,
  signal: AbortSignal | undefined,
): ResultAsync<Collection<T>, IndexerReadError> =>
  readAllItems(
    // Each page is read whole, so its completeness survives the walk.
    (cursor, pageSignal) =>
      read(cursor, pageSignal).map((page) => ({ ...page, items: [page] })),
    { signal },
  ).map((pages) => ({
    rows: pages.flatMap((page) => page.items),
    status: pages.reduce<Completeness>(
      (status, page) => weaker(status, page.completeness),
      'full',
    ),
  }))

export const resolverCollectionCount = (
  count: number | null | undefined,
  status: Completeness | undefined,
): string => {
  if (count == null || status === 'unsupported') return 'Unknown'
  return `${count}${status === 'partial' ? '+' : ''}`
}

export const formatRoleHolderCount = (
  count: number | null | undefined,
  status: Completeness | undefined,
): string =>
  match(resolverCollectionCount(count, status))
    .with('Unknown', () => 'Role holders unknown')
    .with('1', () => '1 role holder')
    .otherwise((formatted) => `${formatted} role holders`)

const readOverview = (
  { address }: ResolverRef,
  signal: AbortSignal | undefined,
) =>
  retryStaleRead(
    (requestSignal) =>
      indexer.getResolver(
        { address, pageSize: OVERVIEW_NODES_PAGE_SIZE },
        { signal: requestSignal },
      ),
    { signal },
  )

/** The overview, which only the node count comes from; a failure leaves the rest to render. */
type BoundNamesRead =
  | { readonly status: 'served'; readonly overview: IndexedResolverOverview }
  | { readonly status: 'unknown' }
  | { readonly status: 'failed' }

const readBoundNames = (
  resolver: ResolverRef,
  signal: AbortSignal | undefined,
): Promise<BoundNamesRead> =>
  readOverview(resolver, signal)
    .map(
      (overview): BoundNamesRead =>
        overview === null
          ? { status: 'unknown' }
          : { status: 'served', overview },
    )
    .unwrapOr({ status: 'failed' })

const toOverview = (
  resolver: ResolverRef,
  bound: BoundNamesRead,
  links: Collection<ResolverLinkRow>,
  roles: Collection<ResolverRoleGrant>,
  events: Page<HistoryEvent> | null,
): ResolverOverview => {
  const overview = bound.status === 'served' ? bound.overview : null
  const boundNames = overview?.boundNames
  const resolverLinks = toLinks(links.rows.flatMap(toLinkedName))
  const resolverRoles = roles.rows.map(toResolverRole)
  return {
    address: resolver.address,
    nodeCount: boundNames
      ? (boundNames.totalCount ?? boundNames.items.length)
      : null,
    nodeCountIsLowerBound:
      !!boundNames &&
      boundNames.totalCount === null &&
      boundNames.nextCursor !== null,
    mirrorRegistry: overview?.mirrorRegistry ?? null,
    links: resolverLinks,
    linkCount: links.status === 'unsupported' ? null : resolverLinks.length,
    linksStatus: links.status,
    rolesStatus: roles.status,
    roles: resolverRoles,
    roleHolderCount:
      roles.status === 'unsupported'
        ? null
        : new Set(resolverRoles.map(({ account }) => account.toLowerCase()))
            .size,
    namedResources: roles.rows.flatMap(namedResourceOf),
    events: events ? events.items.flatMap(toResolverEvent) : null,
    eventsHasMore: events ? events.nextCursor !== null : false,
  }
}

const readResolverLinks = (
  { address }: ResolverRef,
  signal: AbortSignal | undefined,
) =>
  readResolverCollection(
    (cursor, pageSignal) =>
      indexer.getResolverLinks(
        { address, pageSize: COLLECTION_PAGE_SIZE, ...(cursor && { cursor }) },
        { signal: pageSignal },
      ),
    signal,
  )

const readResolverRoles = (
  { address }: ResolverRef,
  signal: AbortSignal | undefined,
) =>
  readResolverCollection(
    (cursor, pageSignal) =>
      indexer.getResolverRoles(
        { address, pageSize: COLLECTION_PAGE_SIZE, ...(cursor && { cursor }) },
        { signal: pageSignal },
      ),
    signal,
  )

/** `account`'s grants on the resolver, with the setter arguments the indexer decoded for them. */
export const getResolverRoleGrants = (
  {
    address,
    account,
  }: { readonly address: Address; readonly account: Address },
  signal?: AbortSignal,
) =>
  readResolverRoles(resolverRefOf(address), signal).map(({ rows }) => {
    const held = rows.filter(
      (grant) => grant.account.toLowerCase() === account.toLowerCase(),
    )
    return {
      roles: held.map(toResolverRole),
      namedResources: held.flatMap(namedResourceOf),
    }
  })

/**
 * The newest events, or null when the indexer fails to serve them, so a
 * failure does not take the other tabs down.
 */
const readRecentEvents = (
  { address }: ResolverRef,
  signal: AbortSignal | undefined,
): Promise<Page<HistoryEvent> | null> =>
  retryStaleRead(
    (requestSignal) =>
      indexer.getEvents(
        {
          resolver: address,
          order: 'desc',
          pageSize: RESOLVER_EVENTS_PAGE_SIZE,
        },
        { signal: requestSignal },
      ),
    { signal },
  ).unwrapOr(null)

/**
 * A resolver's overview in four indexer reads, together: the overview for its
 * bound names, the links and roles collections, and its events.
 * The overview itself carries no counts or samples (bigname #954). Null when
 * the indexer knows no resolver at this address.
 */
const getResolverOverview = (
  { address }: GetResolverOverviewParameters,
  signal?: AbortSignal,
) => {
  const resolver = resolverRefOf(address)
  return ResultAsync.fromSafePromise(
    Promise.all([
      readBoundNames(resolver, signal),
      readResolverLinks(resolver, signal),
      readResolverRoles(resolver, signal),
      readRecentEvents(resolver, signal),
    ]),
  )
    .andThen(([bound, links, roles, events]) =>
      // An unknown resolver's collections fail too; only the overview says it is unknown.
      bound.status === 'unknown'
        ? ok<ResolverOverview | null, IndexerReadError>(null)
        : Result.combine([links, roles]).map(([links, roles]) =>
            toOverview(resolver, bound, links, roles, events),
          ),
    )
    .mapErr((cause) => new GetResolverOverviewError({ cause }))
}

/** One page of the names bound to the resolver, from the overview's `bound_names` cursor. */
export type ResolverNodesPage = {
  readonly nodes: readonly ResolverNode[]
  readonly nextCursor: string | null
  /** Counted on the first page only; null on later pages. */
  readonly totalCount: number | null
}

export const RESOLVER_NODES_PAGE_SIZE = 100

const readBoundNamesPage = (
  resolver: ResolverRef,
  cursor: string | undefined,
  signal: AbortSignal | undefined,
) =>
  retryStaleRead(
    (requestSignal) =>
      indexer.getResolver(
        {
          address: resolver.address,
          pageSize: RESOLVER_NODES_PAGE_SIZE,
          ...(cursor && { cursor }),
        },
        { signal: requestSignal },
      ),
    { signal },
  )
    .andThen((overview) =>
      match({ overview, cursor })
        .returnType<ResultAsync<ResolverNodesPage, IndexerReadError>>()
        .with({ overview: P.nonNullable }, ({ overview }) =>
          okAsync({
            nodes: overview.boundNames.items.map(toResolverNode(resolver)),
            nextCursor: overview.boundNames.nextCursor,
            totalCount: overview.boundNames.totalCount,
          }),
        )
        // A resolver the indexer has not indexed serves no names.
        .with({ cursor: undefined }, () =>
          okAsync({ nodes: [], nextCursor: null, totalCount: 0 }),
        )
        .otherwise(() =>
          errAsync(
            new IndexerReadError({
              kind: 'unavailable',
              message: 'The resolver is no longer indexed',
              cause: undefined,
            }),
          ),
        ),
    )
    .mapErr((cause) => new GetResolverOverviewError({ cause }))

export const resolverNodesQueryKey = createQueryKey<
  'resolver-nodes',
  GetResolverOverviewParameters
>('resolver-nodes')

/** The names bound to the resolver, a page at a time. */
export const getResolverNodesQueryOptions = (
  params: GetResolverOverviewParameters,
) =>
  resultInfiniteQueryOptions({
    queryKey: resolverNodesQueryKey(params),
    queryFn: ({ queryKey: [, params], pageParam, signal }) =>
      readBoundNamesPage(resolverRefOf(params.address), pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ResolverNodesPage) => last.nextCursor ?? undefined,
  })

const resolverOverviewQueryKey = createQueryKey<
  'resolver-overview',
  GetResolverOverviewParameters
>('resolver-overview')

/** The resolver's own event feed, which the history page pages through. */
const resolverHistoryTimelineQueryKey = createQueryKey<
  'get-resolver-history-timeline',
  GetResolverOverviewParameters
>('get-resolver-history-timeline')

/** The resolver's feed, the same one the overview previews, a page at a time. */
export const getResolverHistoryQueryOptions = (
  params: GetResolverOverviewParameters,
) =>
  resultInfiniteQueryOptions({
    queryKey: resolverHistoryTimelineQueryKey(params),
    queryFn: ({ queryKey: [, { address }], pageParam, signal }) =>
      fetchResolverEventsPage({
        resolverAddress: address,
        cursor: pageParam,
        signal,
      }),
    ...timelinePageParams,
  })

const RESOLVER_QUERY_KEYS: ReadonlySet<unknown> = new Set([
  resolverOverviewQueryKey.key,
  resolverNodesQueryKey.key,
  resolverHistoryTimelineQueryKey.key,
  RESOLVER_ROLES_FOR_ACCOUNT,
  NODES_WITH_RECORDS,
])

const isResolver = (value: unknown, address: Address): boolean =>
  String(value).toLowerCase() === address.toLowerCase()

/** Refreshes what a write to the resolver's links or roles changes, the caller's role reads included. */
export const invalidateResolverOverview = (
  queryClient: QueryClient,
  address: Address,
) =>
  queryClient.invalidateQueries({
    predicate: ({ queryKey: [key, params] }) => {
      if (typeof params !== 'object' || params === null) return false
      if (RESOLVER_QUERY_KEYS.has(key))
        return 'address' in params && isResolver(params.address, address)
      return (
        key === 'hasRoles' &&
        'resolverAddress' in params &&
        isResolver(params.resolverAddress, address)
      )
    },
  })

export const getResolverOverviewQueryOptions = (
  params: GetResolverOverviewParameters,
) =>
  resultQueryOptions({
    queryKey: resolverOverviewQueryKey(params),
    queryFn: ({ queryKey: [, params], signal }) =>
      getResolverOverview(params, signal),
  })
