import {
  type BignameError,
  type ResolverLink as BignameResolverLink,
  type ResolverOverview as BignameResolverOverview,
  type ResolverRole as BignameResolverRole,
  type Completeness,
  type Envelope,
  type EventRow,
  isStale,
  MAX_PAGE_SIZE,
  type NameRecord,
  type Power,
  type RecordResource,
  type RecordResourceSelector,
  type ResolverPower,
  readAllEnvelopes,
  retryStale,
  toUnixSeconds,
} from '@ens-apps/indexer/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import {
  resultInfiniteQueryOptions,
  resultQueryOptions,
} from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { QueryClient } from '@tanstack/react-query'
import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import { match, P } from 'ts-pattern'
import type { Address } from 'viem'
import { envConfig } from '@/config'
import {
  fetchResolverEventsPage,
  timelinePageParams,
} from '@/features/history/timelineEventPage'
import { bigname } from '@/lib/bigname'
import {
  encodeResolverRoleBitmap,
  type ResolverRole as ResolverRoleName,
} from '@/lib/roles/resolverRoles'
import { flattenHistoryData } from '@/utils/history/historyEventsToSubgraphEvents'

/**
 * A name that shares its record with at least one other name on this resolver.
 *
 * Records are internal inodes: a setter creates one and links the name to it,
 * and `linkToNode` points a second name at the same `recordId`. So a link is
 * not a stored `from -> to` pair, it is two names resolving to one record —
 * bigname's `/links` rows, grouped by `record_id`.
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
  /** The raw storage kind, else bigname's friendly type. */
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
   * Names whose current registration declares this resolver: bigname's
   * count when it gives one, else the first page's length, a lower bound
   * while `nodeCountIsLowerBound` (shown as "N+"). Null when bigname could
   * not serve the bound names.
   */
  readonly nodeCount: number | null
  readonly nodeCountIsLowerBound: boolean
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
   * when bigname could not serve them, which leaves the rest of the page up.
   */
  readonly events: readonly ResolverEvent[] | null
}

class GetResolverOverviewError extends TaggedError('GetResolverOverviewError')<{
  cause: BignameError
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

/** The overview only counts bound names, so it reads one row and the total. */
const OVERVIEW_NODES_PAGE_SIZE = 1
/** Events listed; a busy resolver's full feed is `/v1/events`, paged. */
const RESOLVER_EVENTS_PAGE_SIZE = MAX_PAGE_SIZE

/**
 * A `/links` row as a named link. The resolver's default record (the empty-name
 * node) and a node bigname has never seen a name for have no name to link or
 * unlink by, so they are left out.
 */
const toLinkedName = (row: BignameResolverLink): LinkedName[] =>
  row.default || !row.name
    ? []
    : [{ name: row.name, namehash: row.namehash, recordId: row.record_id }]

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

const isResolverPower = (power: Power): power is ResolverPower =>
  Object.hasOwn(RESOLVER_ROLE_BY_POWER, power)

export const powersToResolverRoleBitmap = (powers: readonly Power[]): bigint =>
  encodeResolverRoleBitmap(
    powers.flatMap((power) =>
      isResolverPower(power) ? [RESOLVER_ROLE_BY_POWER[power]] : [],
    ),
  )

/** The setter argument a scoped grant is about; an `argument` resource names its first. */
const readingOf = (
  resource: RecordResource,
): RecordResourceSelector | undefined =>
  resource.kind === 'argument' ? resource.selectors[0] : resource

const toNamedResource = (
  resource: RecordResource,
): ResolverNamedResource | undefined => {
  const reading = readingOf(resource)
  if (!reading) return undefined
  const base = { resource: BigInt(resource.hash).toString() }
  return match(reading)
    .returnType<ResolverNamedResource | undefined>()
    .with({ kind: 'address' }, (address) => ({
      ...base,
      recordKind: 'addr',
      recordKey: null,
      coinType:
        address.coin_type?.toString() ?? address.coin_type_decimal ?? null,
    }))
    .with({ kind: P.union('text', 'data') }, (keyed) => ({
      ...base,
      recordKind: keyed.kind,
      recordKey: keyed.key ?? keyed.key_bytes ?? null,
      coinType: null,
    }))
    .with({ kind: 'abi' }, (abi) => ({
      ...base,
      recordKind: 'ABI content type',
      recordKey:
        abi.content_type?.toString() ?? abi.content_type_decimal ?? null,
      coinType: null,
    }))
    .with({ kind: 'interface' }, (iface) => ({
      ...base,
      recordKind: 'interface',
      recordKey: iface.interface_id,
      coinType: null,
    }))
    .otherwise(() => undefined)
}

/**
 * The EAC resource a grant targets: bigname's `eac_resource` when it serves
 * one, else the hash of the record it is scoped to. Neither present does not
 * prove root, so the scope stays unknown and no write can target 0 by
 * inference. The registration handle is opaque and cannot recover it.
 */
const resourceOf = (row: BignameResolverRole): string | null =>
  row.eac_resource ??
  (row.record_resource ? BigInt(row.record_resource.hash).toString() : null)

const toResolverRole = (row: BignameResolverRole): ResolverRole => ({
  account: row.address,
  resource: resourceOf(row),
  registrationId: row.registration_id,
  roleBitmap: powersToResolverRoleBitmap(row.powers).toString(),
  blockNumber: row.grant_event?.block_number ?? 0,
  transactionHash: row.grant_event?.transaction_hash ?? null,
  timestamp: toUnixSeconds(row.grant_event?.timestamp) ?? null,
  name: row.name ?? null,
})

/** A bound name as a node; every bound name's current resolver is this one. */
const toResolverNode =
  (resolver: { readonly address: string }) =>
  (detail: NameRecord): ResolverNode => ({
    id: detail.namehash,
    name: detail.name,
    owner: detail.owner ? { id: detail.owner } : null,
    resolver: { id: resolver.address, address: resolver.address },
  })

/** A row bigname derived from state has no transaction to show. */
const toResolverEvent = (row: EventRow): ResolverEvent[] =>
  row.block_number === null || row.transaction_hash === null
    ? []
    : [
        {
          id: row.id,
          type: row.kind ?? row.type,
          blockNumber: row.block_number,
          timestamp: toUnixSeconds(row.timestamp) ?? null,
          transactionHash: row.transaction_hash,
          data: JSON.stringify(flattenHistoryData(row.data)),
        },
      ]

type ResolverRef = { readonly chainId: number; readonly address: Address }

const resolverRefOf = (address: Address): ResolverRef => ({
  chainId: envConfig.chain.id,
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
  ) => ResultAsync<Envelope<readonly T[]>, BignameError>,
  signal: AbortSignal | undefined,
): ResultAsync<Collection<T>, BignameError> =>
  readAllEnvelopes(read, { signal }).map((pages) => ({
    rows: pages.flatMap((page) => page.data),
    status: pages.reduce<Completeness>(
      (status, page) => weaker(status, page.meta.completeness ?? 'full'),
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

const readOverview = (
  { chainId, address }: ResolverRef,
  signal: AbortSignal | undefined,
) =>
  retryStale(
    (requestSignal) =>
      bigname.resolver(
        chainId,
        address,
        { page_size: OVERVIEW_NODES_PAGE_SIZE, include: ['total_count'] },
        { signal: requestSignal },
      ),
    isStale,
    { signal },
  )

type OverviewPage = Envelope<BignameResolverOverview>

/**
 * The overview, or null when bigname fails to serve it for any reason but an
 * unknown resolver: only the node count comes from it, so the rest still renders.
 */
const readBoundNames = (
  resolver: ResolverRef,
  signal: AbortSignal | undefined,
) =>
  readOverview(resolver, signal)
    .map((overview): OverviewPage | null => overview)
    .orElse((error) =>
      error.code === 'not_found' ? errAsync(error) : okAsync(null),
    )

const toOverview = (
  resolver: ResolverRef,
  overview: OverviewPage | null,
  links: Collection<BignameResolverLink>,
  roles: Collection<BignameResolverRole>,
  events: Envelope<readonly EventRow[]> | null,
): ResolverOverview => {
  const boundNames = overview?.data.bound_names
  const resolverLinks = toLinks(links.rows.flatMap(toLinkedName))
  const resolverRoles = roles.rows.map(toResolverRole)
  return {
    address: resolver.address,
    nodeCount: boundNames
      ? (boundNames.page.total_count ?? boundNames.data.length)
      : null,
    nodeCountIsLowerBound:
      !!boundNames &&
      boundNames.page.total_count === null &&
      boundNames.page.has_more,
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
    namedResources: roles.rows.flatMap((row) =>
      row.record_resource ? (toNamedResource(row.record_resource) ?? []) : [],
    ),
    events: events ? events.data.flatMap(toResolverEvent) : null,
  }
}

/**
 * The newest events, or null when bigname fails to serve them, so a failure
 * does not take the other tabs down.
 */
const readRecentEvents = (
  { chainId, address }: ResolverRef,
  signal: AbortSignal | undefined,
) =>
  retryStale(
    (requestSignal) =>
      bigname.events(
        {
          resolver: `${chainId}:${address}`,
          include: ['data', 'raw'],
          order: 'desc',
          page_size: RESOLVER_EVENTS_PAGE_SIZE,
        },
        { signal: requestSignal },
      ),
    isStale,
    { signal },
  )
    .map((events): Envelope<readonly EventRow[]> | null => events)
    .orElse(() =>
      okAsync<Envelope<readonly EventRow[]> | null, BignameError>(null),
    )

/**
 * A resolver's overview in four bigname reads, together: the overview for its
 * bound names, the `/links` and `/roles` collections, and its events.
 * The overview itself carries no counts or samples (bigname #954). Null when
 * bigname knows no resolver at this address.
 */
const getResolverOverview = (
  { address }: GetResolverOverviewParameters,
  signal?: AbortSignal,
) => {
  const resolver = resolverRefOf(address)
  const { chainId } = resolver
  return ResultAsync.combine([
    readBoundNames(resolver, signal),
    readResolverCollection<BignameResolverLink>(
      (cursor, pageSignal) =>
        bigname.resolverLinks(
          chainId,
          resolver.address,
          { page_size: MAX_PAGE_SIZE, ...(cursor && { cursor }) },
          { signal: pageSignal },
        ),
      signal,
    ),
    readResolverCollection<BignameResolverRole>(
      (cursor, pageSignal) =>
        bigname.resolverRoles(
          chainId,
          resolver.address,
          { page_size: MAX_PAGE_SIZE, ...(cursor && { cursor }) },
          { signal: pageSignal },
        ),
      signal,
    ),
    readRecentEvents(resolver, signal),
  ])
    .map(([overview, links, roles, events]): ResolverOverview | null =>
      toOverview(resolver, overview, links, roles, events),
    )
    .orElse((error) =>
      error.code === 'not_found'
        ? okAsync<ResolverOverview | null, BignameError>(null)
        : errAsync(error),
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
  retryStale(
    (requestSignal) =>
      bigname.resolver(
        resolver.chainId,
        resolver.address,
        cursor
          ? { page_size: RESOLVER_NODES_PAGE_SIZE, cursor }
          : { page_size: RESOLVER_NODES_PAGE_SIZE, include: ['total_count'] },
        { signal: requestSignal },
      ),
    isStale,
    { signal },
  )
    .map(
      ({ data }): ResolverNodesPage => ({
        nodes: data.bound_names.data.map(toResolverNode(resolver)),
        nextCursor: data.bound_names.page.next_cursor,
        totalCount: data.bound_names.page.total_count,
      }),
    )
    // A resolver bigname has not indexed serves no names.
    .orElse((error) =>
      error.code === 'not_found' && cursor === undefined
        ? okAsync<ResolverNodesPage, BignameError>({
            nodes: [],
            nextCursor: null,
            totalCount: 0,
          })
        : errAsync(error),
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
])

/** Refreshes what a write to the resolver's links or roles changes. */
export const invalidateResolverOverview = (
  queryClient: QueryClient,
  address: Address,
) =>
  queryClient.invalidateQueries({
    predicate: ({ queryKey: [key, params] }) =>
      RESOLVER_QUERY_KEYS.has(key) &&
      typeof params === 'object' &&
      params !== null &&
      'address' in params &&
      String(params.address).toLowerCase() === address.toLowerCase(),
  })

export const getResolverOverviewQueryOptions = (
  params: GetResolverOverviewParameters,
) =>
  resultQueryOptions({
    queryKey: resolverOverviewQueryKey(params),
    queryFn: ({ queryKey: [, params], signal }) =>
      getResolverOverview(params, signal),
  })
