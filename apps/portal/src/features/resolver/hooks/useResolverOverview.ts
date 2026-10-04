import {
  type BignameError,
  type ContractRef,
  fetchAllPages,
  type HistoryEvent,
  isNameProfile,
  MAX_PAGE_SIZE,
  type NameDetail,
  type Power,
  type RecordResource,
  type RecordResourceReading,
  type ResolverLinkRow,
  type ResolverRoleRow,
  timestampToSeconds,
} from '@ens-apps/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import {
  encodeResolverRoleBitmap,
  type ResolverRole as ResolverRoleName,
} from '@/lib/roles/resolverRoles'
import { sepoliaWithEns } from '@/lib/wagmi'
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
  /** EAC resource as a decimal string; `0` for a root grant. */
  readonly resource: string
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
  readonly id: string
  readonly address: string
  /** Names whose current registration declares this resolver. */
  readonly nodeCount: number
  readonly linkCount: number
  /** Distinct accounts holding a resolver-scoped role. */
  readonly roleHolderCount: number
  /** The first page of bound names (see `RESOLVER_NODES_PAGE_SIZE`). */
  readonly nodes: readonly ResolverNode[]
  readonly links: readonly ResolverLink[]
  readonly namedResources: readonly ResolverNamedResource[]
  readonly roles: readonly ResolverRole[]
  /** The newest events (see `RESOLVER_EVENTS_PAGE_SIZE`), newest first. */
  readonly events: readonly ResolverEvent[]
  /** Every event naming this resolver; absent past bigname's 10,000-row count cap. */
  readonly eventCount: number | undefined
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

/** Bound names listed; `nodeCount` is the exact total however many there are. */
const RESOLVER_NODES_PAGE_SIZE = MAX_PAGE_SIZE
/** Events listed; a busy resolver's full feed is `/v1/events`, paged. */
const RESOLVER_EVENTS_PAGE_SIZE = MAX_PAGE_SIZE
/** Bound on the links and roles collections, which are read whole. */
const RESOLVER_COLLECTION_MAX_ROWS = 1000

/**
 * A `/links` row as a named link. The resolver's default record (the empty-name
 * node) and a node bigname has never seen a name for have no name to link or
 * unlink by, so they are left out.
 */
const toLinkedName = (row: ResolverLinkRow): LinkedName[] =>
  row.default || !row.name
    ? []
    : [{ name: row.name, namehash: row.namehash, recordId: row.record_id }]

/**
 * bigname's power names for a `PermissionedResolver` role, mapped onto the
 * role names its bitmap is built from. `set_pubkey`, `set_alias` and
 * `clear_records` have no bit on this resolver generation.
 */
const RESOLVER_ROLE_BY_POWER: Partial<Record<Power, ResolverRoleName>> = {
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

export const powersToResolverRoleBitmap = (powers: readonly Power[]): bigint =>
  encodeResolverRoleBitmap(
    powers.flatMap((power) => RESOLVER_ROLE_BY_POWER[power] ?? []),
  )

/** The setter argument a scoped grant is about; an `argument` resource names its first. */
const readingOf = (
  resource: RecordResource,
): RecordResourceReading | undefined =>
  resource.kind === 'argument' ? resource.selectors[0] : resource

const toNamedResource = (
  resource: RecordResource,
): ResolverNamedResource | undefined => {
  const reading = readingOf(resource)
  if (!reading) return undefined
  const base = { resource: BigInt(resource.hash).toString() }
  switch (reading.kind) {
    case 'address':
      return {
        ...base,
        recordKind: 'addr',
        recordKey: null,
        coinType:
          reading.coin_type?.toString() ?? reading.coin_type_decimal ?? null,
      }
    case 'text':
    case 'data':
      return {
        ...base,
        recordKind: reading.kind,
        recordKey: reading.key ?? reading.key_bytes ?? null,
        coinType: null,
      }
    case 'abi':
      return {
        ...base,
        recordKind: 'ABI content type',
        recordKey:
          reading.content_type?.toString() ??
          reading.content_type_decimal ??
          null,
        coinType: null,
      }
    case 'interface':
      return {
        ...base,
        recordKind: 'interface',
        recordKey: reading.interface_id,
        coinType: null,
      }
  }
}

/**
 * A `/roles` row as a role grant. A root grant carries no `record_resource`
 * and sits on resource `0`; a scoped one sits on its setter argument's
 * resource, `keccak256` of the argument, which `record_resource.hash` is.
 */
const toResolverRole = (row: ResolverRoleRow): ResolverRole => ({
  account: row.address,
  resource: row.record_resource
    ? BigInt(row.record_resource.hash).toString()
    : '0',
  roleBitmap: powersToResolverRoleBitmap(row.powers).toString(),
  blockNumber: row.grant_event?.block_number ?? 0,
  transactionHash: row.grant_event?.transaction_hash ?? null,
  timestamp: timestampToSeconds(row.grant_event?.timestamp) ?? null,
  name: row.name ?? null,
})

/** A bound name as a node; every bound name's current resolver is this one. */
const toResolverNode =
  (resolver: ContractRef) =>
  (detail: NameDetail): ResolverNode => ({
    id: detail.namehash,
    name: detail.name,
    owner: isNameProfile(detail) && detail.owner ? { id: detail.owner } : null,
    resolver: { id: resolver.address, address: resolver.address },
  })

const toResolverEvent = (row: HistoryEvent): ResolverEvent[] =>
  row.block_number === null
    ? []
    : [
        {
          id: row.id,
          type: row.kind ?? row.type,
          blockNumber: row.block_number,
          timestamp: timestampToSeconds(row.timestamp) ?? null,
          transactionHash: row.transaction_hash,
          data: JSON.stringify(flattenHistoryData(row.data)),
        },
      ]

/**
 * A resolver's overview in four bigname reads: the overview for its bound
 * names, the `/links` and `/roles` collections, and its events. The overview
 * itself carries no counts or samples (bigname #954).
 */
const getResolverOverview = ({ address }: GetResolverOverviewParameters) => {
  const chainId = sepoliaWithEns.id
  const resolver: ContractRef = {
    chain_id: chainId,
    address: address.toLowerCase() as Address,
  }
  return fromPromise(
    Promise.all([
      bigname.getResolver(chainId, resolver.address, {
        page_size: RESOLVER_NODES_PAGE_SIZE,
      }),
      fetchAllPages(
        (cursor) =>
          bigname.listResolverLinks(chainId, resolver.address, {
            page_size: MAX_PAGE_SIZE,
            cursor,
          }),
        { maxRows: RESOLVER_COLLECTION_MAX_ROWS },
      ),
      fetchAllPages(
        (cursor) =>
          bigname.listResolverRoles(chainId, resolver.address, {
            page_size: MAX_PAGE_SIZE,
            cursor,
          }),
        { maxRows: RESOLVER_COLLECTION_MAX_ROWS },
      ),
      bigname.listEvents({
        resolver,
        include: ['data', 'raw'],
        order: 'desc',
        page_size: RESOLVER_EVENTS_PAGE_SIZE,
      }),
    ]),
    (e) => new GetResolverOverviewError({ cause: e as BignameError }),
  ).map(([overview, links, roles, events]): ResolverOverview | null => {
    // null = bigname has no overview for this address: not a resolver it knows.
    if (!overview) return null
    const boundNames = overview.data.bound_names
    const resolverLinks = toLinks(links.rows.flatMap(toLinkedName))
    const resolverRoles = roles.rows.map(toResolverRole)
    return {
      id: resolver.address,
      address: resolver.address,
      nodeCount: boundNames.page.total_count ?? boundNames.data.length,
      nodes: boundNames.data.map(toResolverNode(resolver)),
      links: resolverLinks,
      linkCount: resolverLinks.length,
      roles: resolverRoles,
      roleHolderCount: new Set(
        resolverRoles.map(({ account }) => account.toLowerCase()),
      ).size,
      namedResources: roles.rows.flatMap((row) =>
        row.record_resource ? (toNamedResource(row.record_resource) ?? []) : [],
      ),
      events: events.data.flatMap(toResolverEvent),
      eventCount: events.page.total_count ?? undefined,
    }
  })
}

const resolverOverviewQueryKey = createQueryKey<
  'resolver-overview',
  GetResolverOverviewParameters
>('resolver-overview')

export const getResolverOverviewQueryOptions = (
  params: GetResolverOverviewParameters,
) =>
  resultQueryOptions({
    queryKey: resolverOverviewQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getResolverOverview(params),
  })
