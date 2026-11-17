import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import { namehash } from 'viem'
import { toV1HistoryEvent } from '../ensnode/history'
import {
  toV1BoundName,
  toV1NameSummary,
  toV1Relations,
  toV1Subname,
} from '../ensnode/names'
import * as V1 from '../ensnode/queries'
import type { V1Domain, V1Event } from '../ensnode/types'
import type { IndexerClient } from '../reads/client.types'
import type { Page } from '../reads/common.types'
import { IndexerReadError } from '../reads/errors'
import type { HistoryEvent, HistoryEventKind } from '../reads/history.types'
import type { Subname, SubnamesQuery } from '../reads/names.types'
import type { NamesForAddressQuery } from '../reads/namesForAddress.types'
import { createGraphqlTransport, type GraphqlRequest } from '../shared/graphql'
import {
  type CursorRow,
  decodeMergeCursor,
  EMPTY_PAGE,
  encodeMergeCursor,
  type MergeCursor,
  mergePages,
  type SourcePage,
} from '../shared/merge'
import { type PagingStop, readAllPages } from '../shared/paging'
import { isEth2ld, toAccount, V2_GRACE_MS } from '../shared/values'
import {
  isChildOf,
  toRelations,
  toSummaryComparator,
  toV1Variables,
  toV2Variables,
} from './filters'
import { type EventContext, toHistoryEvent, toZigensTypes } from './history'
import {
  isRegisteredV2,
  pickNameDetail,
  toV2NameSummary,
  toV2Subname,
} from './names'
import * as V2 from './queries'
import { type ResolverRecords, toRecordKeys } from './records'
import {
  toPowersByName,
  toRegistry,
  toRegistryLabel,
  toResolverLink,
  toResolverRoleGrant,
  toRootRoleGrant,
  toV2BoundName,
} from './registry'
import type {
  Connection,
  RegistryRow,
  ResolverBinding,
  RoleAssignment,
  V2Domain,
  V2Event,
} from './types'

export type ZigensIndexerOptions = Readonly<{
  /** zigens GraphQL, read for ENSv2. */
  zigensGraphql: string
  /** ENSNode's subgraph-compatible GraphQL, read for ENSv1. */
  ensNodeSubgraph: string
  chainId: number
  /** The chain's NameWrapper, which tells a wrapped ENSv1 name from a stale wrapper token. */
  nameWrapper: string
  fetch?: typeof fetch
  timeoutMs?: number
  /** The clock registration status is decided against. */
  now?: () => Date
}>

const DEFAULT_PAGE_SIZE = 50
// zigens rejects a page of full domain rows past its query-complexity budget.
const MAX_PAGE_SIZE = 100
// Both schemas cap `name_in` at 1000 names.
const MAX_NAMES = 1000

const toPageSize = (pageSize: number | undefined) =>
  Math.min(pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

const fromConnection = <Node, Item>(
  connection: Connection<Node>,
  toItem: (node: Node) => Item | null,
): SourcePage<Item> => ({
  rows: connection.edges.flatMap(({ cursor, node }): CursorRow<Item>[] => {
    const item = toItem(node)
    return item === null ? [] : [{ item, after: cursor }]
  }),
  hasMore: connection.pageInfo.hasNextPage,
  endCursor: connection.pageInfo.endCursor,
  totalCount: connection.totalCount,
})

/** A `first`/`skip` page; its cursors are row offsets. */
const fromSkipPage = <Row, Item>(
  rows: readonly Row[],
  skip: number,
  pageSize: number,
  toItem: (row: Row) => Item | null,
): SourcePage<Item> => ({
  rows: rows.flatMap((row, index): CursorRow<Item>[] => {
    const item = toItem(row)
    return item === null ? [] : [{ item, after: String(skip + index + 1) }]
  }),
  hasMore: rows.length === pageSize,
  endCursor: rows.length > 0 ? String(skip + rows.length) : null,
  totalCount: null,
})

const toSkip = (cursor: string | undefined) => {
  const skip = Number(cursor ?? 0)
  return Number.isSafeInteger(skip) && skip >= 0 ? skip : 0
}

/** Reads from both sources where `cursor` left them, then merges the two pages. */
const readMerged = <Item>({
  cursor,
  pageSize,
  readFirst,
  readSecond,
  compare,
  keyOf,
}: Readonly<{
  cursor: string | undefined
  pageSize: number
  readFirst: (
    cursor: string | undefined,
  ) => ResultAsync<SourcePage<Item>, IndexerReadError>
  readSecond: (
    cursor: string | undefined,
  ) => ResultAsync<SourcePage<Item>, IndexerReadError>
  compare: (a: Item, b: Item) => number
  keyOf: (item: Item) => string
}>): ResultAsync<Page<Item>, IndexerReadError> =>
  decodeMergeCursor(cursor)
    .asyncAndThen((state: MergeCursor) =>
      ResultAsync.combine([
        state.first === null
          ? okAsync<SourcePage<Item>, IndexerReadError>(EMPTY_PAGE)
          : readFirst(state.first),
        state.second === null
          ? okAsync<SourcePage<Item>, IndexerReadError>(EMPTY_PAGE)
          : readSecond(state.second),
      ]).map(([first, second]) =>
        mergePages({ first, second, cursor: state, compare, keyOf, pageSize }),
      ),
    )
    .map((merged) => ({
      items: merged.items,
      nextCursor: merged.nextCursor && encodeMergeCursor(merged.nextCursor),
      totalCount: merged.totalCount,
    }))

const toStopError = (reason: PagingStop) =>
  new IndexerReadError({
    kind: 'unavailable',
    message: `Paging stopped: ${reason}`,
    cause: reason,
  })

// zigens and ENSNode never answer stale.
const isNeverStale = () => false

/** Every page of a zigens connection. */
const readAllEdges = <Node>(
  readPage: (
    after: string | undefined,
    signal?: AbortSignal,
  ) => ResultAsync<Connection<Node>, IndexerReadError>,
  signal: AbortSignal | undefined,
) =>
  readAllPages({
    readPage: (cursor, pageSignal) =>
      readPage(cursor, pageSignal).map((connection) => ({
        rows: connection.edges.map(({ node }) => node),
        nextCursor: connection.pageInfo.hasNextPage
          ? connection.pageInfo.endCursor
          : null,
      })),
    isStaleError: isNeverStale,
    toStopError,
    signal,
  })

const EMPTY_SUBNAMES: Page<Subname> = {
  items: [],
  nextCursor: null,
  totalCount: 0,
}

const isUnexpired = (subname: Subname, at: Date) =>
  subname.expiresAt === null || subname.expiresAt > at

const byBlock =
  (order: 'asc' | 'desc' | undefined) => (a: HistoryEvent, b: HistoryEvent) =>
    (order === 'asc' ? 1 : -1) * ((a.blockNumber ?? 0) - (b.blockNumber ?? 0))

const keepKinds =
  (kinds: readonly HistoryEventKind[] | undefined) => (event: HistoryEvent) =>
    !kinds?.length ||
    (event.kind !== null && kinds.some((kind) => kind === event.kind))

const keepRecordKey =
  (recordKey: string | undefined) => (event: HistoryEvent) =>
    recordKey === undefined ||
    (event.type === 'record' && event.data.key === recordKey)

const toUnixSeconds = (date: Date | undefined) =>
  date === undefined ? undefined : Math.floor(date.getTime() / 1000)

type HistoryWindow = Readonly<{
  types?: readonly HistoryEvent['type'][]
  recordKey?: string
  from?: Date
  to?: Date
}>

const toEventWhere = (query: HistoryWindow) => {
  const types = query.recordKey ? ['record' as const] : query.types
  return {
    ...(types?.length && { type_in: toZigensTypes(types) }),
    ...(query.from && { timestamp_gte: toUnixSeconds(query.from) }),
    ...(query.to && { timestamp_lte: toUnixSeconds(query.to) }),
  }
}

/** `IndexerClient` over zigens (ENSv2) and ENSNode (ENSv1); a merged read fails if either source fails. */
export const createZigensIndexer = ({
  zigensGraphql,
  ensNodeSubgraph,
  chainId,
  nameWrapper,
  fetch,
  timeoutMs,
  now = () => new Date(),
}: ZigensIndexerOptions): IndexerClient => {
  const zigens: GraphqlRequest = createGraphqlTransport({
    url: zigensGraphql,
    fetch,
    timeoutMs,
  })
  const ensNode: GraphqlRequest = createGraphqlTransport({
    url: ensNodeSubgraph,
    fetch,
    timeoutMs,
  })
  const eventContext: EventContext = { chainId, roleContract: 'registry' }

  const readV2Domains = (names: readonly string[], signal?: AbortSignal) =>
    zigens<{ domains: readonly V2Domain[] }>(
      V2.DOMAINS_BY_NAMES,
      { names },
      signal,
    ).map(({ domains }) => domains.filter((domain) => domain.protocol === 'v2'))

  const readV1Domains = (names: readonly string[], signal?: AbortSignal) =>
    ensNode<{ domains: readonly V1Domain[] }>(
      V1.DOMAINS_BY_NAMES,
      { names },
      signal,
    ).map(({ domains }) => domains)

  const readNames = (names: readonly string[], signal?: AbortSignal) =>
    ResultAsync.combine([
      readV2Domains(names, signal),
      readV1Domains(names, signal),
    ]).map(([v2, v1]) =>
      names.map((name) =>
        pickNameDetail(
          v2.find((domain) => domain.name === name),
          v1.find((domain) => domain.name === name),
          { now: now(), nameWrapper },
        ),
      ),
    )

  /** Names `account` holds an ENSv2 label role on, with its powers there. */
  const readRolePowers = (account: string, signal?: AbortSignal) =>
    readAllEdges(
      (after, pageSignal) =>
        zigens<{ roleConnection: Connection<RoleAssignment> }>(
          V2.ROLE_CONNECTION,
          { first: MAX_NAMES, after, account: account.toLowerCase() },
          pageSignal,
        ).map(({ roleConnection }) => roleConnection),
      signal,
    ).map(toPowersByName)

  const readV2NamePage = (
    query: NamesForAddressQuery,
    powersByName: ReadonlyMap<string, readonly string[]>,
    after: string | undefined,
    signal?: AbortSignal,
  ) => {
    const pageSize = toPageSize(query.pageSize)
    const variables = toV2Variables(
      query,
      [...powersByName.keys()].slice(0, MAX_NAMES),
      after,
      pageSize,
    )
    if (query.protocol === 'v1' || variables === null) {
      return okAsync<
        SourcePage<ReturnType<typeof toV2NameSummary>>,
        IndexerReadError
      >(EMPTY_PAGE)
    }
    return zigens<{ domainConnection: Connection<V2Domain> }>(
      V2.DOMAIN_CONNECTION,
      variables,
      signal,
    ).map(({ domainConnection }) =>
      fromConnection(domainConnection, (domain) =>
        query.parent && !isChildOf(domain.name ?? '', query.parent)
          ? null
          : toV2NameSummary(domain, {
              address: query.address,
              now: now(),
              powersByName,
              includeCounts: query.includeCounts,
              includeRoles: query.includeRoles,
            }),
      ),
    )
  }

  const readV1NamePage = (
    query: NamesForAddressQuery,
    cursor: string | undefined,
    signal?: AbortSignal,
  ) => {
    const pageSize = toPageSize(query.pageSize)
    const skip = toSkip(cursor)
    const variables = toV1Variables(query, skip, pageSize)
    if (query.protocol === 'v2' || variables === null) {
      return okAsync<
        SourcePage<ReturnType<typeof toV1NameSummary>>,
        IndexerReadError
      >(EMPTY_PAGE)
    }
    const relations = toRelations(query)
    return ensNode<{ domains: readonly V1Domain[] }>(
      V1.DOMAINS,
      variables,
      signal,
    ).map(({ domains }) =>
      fromSkipPage(domains, skip, pageSize, (domain) =>
        query.resolvesTo ||
        toV1Relations(domain, query.address, nameWrapper).some((relation) =>
          relations.includes(relation),
        )
          ? toV1NameSummary(domain, {
              address: query.address,
              now: now(),
              nameWrapper,
              includeCounts: query.includeCounts,
              includeRoles: query.includeRoles,
            })
          : null,
      ),
    )
  }

  const readV2Events = (
    where: Readonly<Record<string, unknown>>,
    order: 'asc' | 'desc' | undefined,
    after: string | undefined,
    pageSize: number,
    context: EventContext,
    signal?: AbortSignal,
  ) =>
    zigens<{ eventConnection: Connection<V2Event> }>(
      V2.EVENT_CONNECTION,
      { where, first: pageSize, after, orderDirection: order ?? 'desc' },
      signal,
    ).map(({ eventConnection }) =>
      fromConnection(eventConnection, (event) =>
        toHistoryEvent(event, context),
      ),
    )

  const readV2Subnames = (
    subregistry: string,
    { includeExpired, includeCounts, pageSize, cursor }: SubnamesQuery,
    signal?: AbortSignal,
  ) =>
    zigens<{ registry: { labelConnection: Connection<V2Domain> } | null }>(
      V2.REGISTRY_LABELS,
      {
        address: subregistry,
        where: includeExpired ? { includeUnreachable: true } : {},
        first: toPageSize(pageSize),
        after: cursor,
        orderBy: 'name',
        orderDirection: 'asc',
      },
      signal,
    ).map(({ registry }): Page<Subname> => {
      const connection = registry?.labelConnection
      const at = now()
      return {
        // zigens cannot filter for "no expiry or not yet expired", so expired rows go here.
        items: (connection?.edges ?? [])
          .map(({ node }) => toV2Subname(node, { now: at, includeCounts }))
          .filter((subname) => includeExpired || isUnexpired(subname, at)),
        nextCursor: connection?.pageInfo.hasNextPage
          ? connection.pageInfo.endCursor
          : null,
        totalCount: connection?.totalCount ?? null,
      }
    })

  const readV1Subnames = (
    parent: V1Domain,
    { includeExpired, includeCounts, pageSize, cursor }: SubnamesQuery,
    signal?: AbortSignal,
  ) => {
    const size = toPageSize(pageSize)
    const skip = toSkip(cursor)
    const at = now()
    return ensNode<{ domains: readonly V1Domain[] }>(
      V1.DOMAINS,
      {
        where: {
          parent: parent.id,
          ...(!includeExpired && {
            or: [
              { expiryDate: null },
              { expiryDate_gt: String(toUnixSeconds(at)) },
            ],
          }),
        },
        first: size,
        skip,
        orderBy: 'name',
        orderDirection: 'asc',
      },
      signal,
    ).map(
      ({ domains }): Page<Subname> => ({
        items: domains.map((domain) =>
          toV1Subname(domain, { now: at, nameWrapper, includeCounts }),
        ),
        nextCursor: domains.length === size ? String(skip + size) : null,
        // The subgraph's count includes expired children.
        totalCount: includeExpired ? parent.subdomainCount : null,
      }),
    )
  }

  const filterHistory = (
    page: Page<HistoryEvent>,
    query: Readonly<{
      kinds?: readonly HistoryEventKind[]
      recordKey?: string
    }>,
  ): Page<HistoryEvent> => ({
    ...page,
    items: page.items
      .filter(keepKinds(query.kinds))
      .filter(keepRecordKey(query.recordKey)),
  })

  return {
    getNameDetail: ({ name }, options) =>
      readNames([name], options?.signal).map(([detail]) => detail ?? null),

    getNames: ({ names }, options) => readNames(names, options?.signal),

    getNamesForAddress: (query, options) => {
      const signal = options?.signal
      const needsRoles =
        !query.resolvesTo &&
        query.protocol !== 'v1' &&
        (toRelations(query).includes('role_holder') || !!query.includeRoles)
      const rolePowers = needsRoles
        ? readRolePowers(query.address, signal)
        : okAsync<ReadonlyMap<string, readonly string[]>, IndexerReadError>(
            new Map(),
          )
      if (
        query.resolvesTo &&
        ![undefined, 60, 'evm'].includes(query.coinType)
      ) {
        return errAsync(
          new IndexerReadError({
            kind: 'rejected',
            message: 'Only ETH address records can be matched',
            cause: query.coinType,
          }),
        )
      }
      return rolePowers.andThen((powersByName) =>
        readMerged({
          cursor: query.cursor,
          pageSize: toPageSize(query.pageSize),
          readFirst: (after) =>
            readV2NamePage(query, powersByName, after, signal),
          readSecond: (cursor) => readV1NamePage(query, cursor, signal),
          compare: toSummaryComparator(query),
          keyOf: (summary) => summary.namehash,
        }).map((page) => ({
          ...page,
          items: query.resolvesTo
            ? page.items.map((summary) => ({
                ...summary,
                resolvedCoinTypes: [60],
              }))
            : page.items,
        })),
      )
    },

    getGraceNames: ({ address, now: at }, options) => {
      const nowSeconds = Math.floor(at.getTime() / 1000)
      return readAllEdges(
        (after, signal) =>
          zigens<{ domainConnection: Connection<V2Domain> }>(
            V2.DOMAIN_CONNECTION,
            {
              where: {
                owner: address.toLowerCase(),
                name_ends_with: '.eth',
                expiry_lte: nowSeconds,
                expiry_gt: nowSeconds - V2_GRACE_MS / 1000,
                includeUnreachable: true,
              },
              first: MAX_PAGE_SIZE,
              after,
              orderBy: 'expiryDate',
              orderDirection: 'asc',
            },
            signal,
          ).map(({ domainConnection }) => domainConnection),
        options?.signal,
      ).map((domains) =>
        domains
          .filter((domain) => isEth2ld(domain.name ?? ''))
          .map((domain) =>
            toV2NameSummary(domain, {
              address,
              now: at,
              powersByName: new Map(),
            }),
          )
          .filter((summary) => summary.registrationStatus === 'expired')
          .map((summary) => ({ ...summary, relations: [] })),
      )
    },

    getSubnames: (query, options) =>
      ResultAsync.combine([
        readV2Domains([query.name], options?.signal),
        readV1Domains([query.name], options?.signal),
      ]).andThen(([[v2], [v1]]) => {
        if (v2 && isRegisteredV2(v2)) {
          return v2.subregistry
            ? readV2Subnames(v2.subregistry.address, query, options?.signal)
            : okAsync(EMPTY_SUBNAMES)
        }
        return v1
          ? readV1Subnames(v1, query, options?.signal)
          : okAsync(EMPTY_SUBNAMES)
      }),

    getRecordKeys: ({ name, resolver }, options) => {
      const signal = options?.signal
      if (resolver) {
        const variables = {
          address: resolver.toLowerCase(),
          node: namehash(name),
        }
        return ResultAsync.combine([
          zigens<{ resolvers: readonly ResolverRecords[] }>(
            V2.RESOLVER_AT,
            variables,
            signal,
          ),
          ensNode<{ resolvers: readonly ResolverRecords[] }>(
            V1.RESOLVER_AT,
            variables,
            signal,
          ),
        ]).map(
          ([
            {
              resolvers: [v2],
            },
            {
              resolvers: [v1],
            },
          ]) => {
            const records = v2 ?? v1
            return records ? toRecordKeys(records) : null
          },
        )
      }
      return ResultAsync.combine([
        zigens<{
          domains: readonly Readonly<{
            protocol: string
            owner: { id: string }
            resolver: ResolverRecords | null
          }>[]
        }>(V2.RESOLVER_OF_NAME, { names: [name] }, signal),
        ensNode<{
          domains: readonly Readonly<{ resolver: ResolverRecords | null }>[]
        }>(V1.RESOLVER_OF_NAME, { name }, signal),
      ]).map(
        ([
          { domains: v2Rows },
          {
            domains: [v1],
          },
        ]) => {
          const v2 = v2Rows.find(isRegisteredV2)
          if (v2) return toRecordKeys(v2.resolver)
          return v1 ? toRecordKeys(v1.resolver) : null
        },
      )
    },

    getNameHistory: (query, options) => {
      const signal = options?.signal
      const pageSize = toPageSize(query.pageSize)
      return readV2Domains([query.name], signal).andThen(([v2]) => {
        if (v2 && isRegisteredV2(v2)) {
          const from =
            query.scope === 'registration' && v2.registrationDate !== null
              ? new Date(
                  Math.max(
                    query.from?.getTime() ?? 0,
                    v2.registrationDate * 1000,
                  ),
                )
              : query.from
          return readMerged({
            cursor: query.cursor,
            pageSize,
            readFirst: (after) =>
              readV2Events(
                { namehash: v2.id, ...toEventWhere({ ...query, from }) },
                query.order,
                after,
                pageSize,
                eventContext,
                signal,
              ),
            readSecond: () => okAsync(EMPTY_PAGE),
            compare: byBlock(query.order),
            keyOf: (event) => event.id,
          }).map((page) => filterHistory(page, query))
        }
        const id = namehash(query.name)
        const order = query.order ?? 'desc'
        const read = (domainSkip: number, registrationSkip: number) =>
          ensNode<{
            domain: Readonly<{
              name: string | null
              events: readonly V1Event[]
              registration: Readonly<{ events: readonly V1Event[] }> | null
            }> | null
          }>(
            V1.NAME_EVENTS,
            {
              id,
              first: pageSize,
              domainSkip,
              registrationSkip,
              orderDirection: order,
            },
            signal,
          )
        const toEvents = (name: string | null) => (event: V1Event) =>
          toV1HistoryEvent(event, { chainId, name })
        return readMerged({
          cursor: query.cursor,
          pageSize,
          readFirst: (cursor) =>
            read(toSkip(cursor), 0).map(({ domain }) =>
              fromSkipPage(
                domain?.events ?? [],
                toSkip(cursor),
                pageSize,
                toEvents(domain?.name ?? null),
              ),
            ),
          readSecond: (cursor) =>
            read(0, toSkip(cursor)).map(({ domain }) =>
              fromSkipPage(
                domain?.registration?.events ?? [],
                toSkip(cursor),
                pageSize,
                toEvents(domain?.name ?? null),
              ),
            ),
          compare: byBlock(order),
          keyOf: (event) => event.id,
        }).map((page) =>
          filterHistory(
            {
              ...page,
              items: page.items.filter(
                (event) =>
                  !query.types?.length || query.types.includes(event.type),
              ),
            },
            query,
          ),
        )
      })
    },

    getAddressHistory: (query, options) => {
      const signal = options?.signal
      const pageSize = toPageSize(query.pageSize)
      const order = query.order ?? 'desc'
      return readMerged({
        cursor: query.cursor,
        pageSize,
        readFirst: (after) =>
          readV2Events(
            {
              involved: query.address.toLowerCase(),
              protocol: 'v2',
              ...toEventWhere(query),
            },
            order,
            after,
            pageSize,
            eventContext,
            signal,
          ),
        readSecond: (cursor) => {
          const skip = toSkip(cursor)
          return ensNode<{
            nameRegistereds: readonly (V1Event &
              Readonly<{
                registration: { domain: { name: string | null } } | null
              }>)[]
          }>(
            V1.REGISTRANT_EVENTS,
            {
              registrant: query.address.toLowerCase(),
              first: pageSize,
              skip,
              orderDirection: order,
            },
            signal,
          ).map(({ nameRegistereds }) =>
            fromSkipPage(nameRegistereds, skip, pageSize, (event) =>
              toV1HistoryEvent(event, {
                chainId,
                name: event.registration?.domain.name ?? null,
              }),
            ),
          )
        },
        compare: byBlock(order),
        keyOf: (event) => event.id,
      }).map((page) => filterHistory(page, query))
    },

    getEvents: (query, options) => {
      const signal = options?.signal
      const pageSize = toPageSize(query.pageSize)
      const context: EventContext = {
        chainId,
        roleContract: query.resolver ? 'resolver' : 'registry',
      }
      // A registration id is the versioned token id; its rows start at that registration.
      const registration: ResultAsync<
        Readonly<{ id: string; registrationDate: number | null }> | null,
        IndexerReadError
      > = query.registrationId
        ? zigens<{
            domains: readonly Readonly<{
              id: string
              registrationDate: number | null
            }>[]
          }>(V2.DOMAIN_BY_TOKEN, { tokenId: query.registrationId }, signal).map(
            ({ domains: [domain] }) => domain ?? null,
          )
        : okAsync<null, IndexerReadError>(null)
      return registration.andThen((domain) => {
        if (query.registrationId && !domain) {
          return okAsync<Page<HistoryEvent>, IndexerReadError>({
            items: [],
            nextCursor: null,
            totalCount: 0,
          })
        }
        const roleFilter = query.kinds?.includes('RootPermissionChanged')
          ? { type: 'EACRolesChanged', resource: '0x0' }
          : {}
        const where = {
          ...toEventWhere(query),
          ...roleFilter,
          ...(query.name && { namehash: namehash(query.name) }),
          ...(domain && {
            namehash: domain.id,
            ...(domain.registrationDate !== null && {
              timestamp_gte: domain.registrationDate,
            }),
          }),
          ...(query.address && { involved: query.address.toLowerCase() }),
          // zigens lists the events a resolver emitted, not names pointed at it.
          ...((query.resolver ?? query.contractAddress) && {
            contractAddress: (
              query.resolver ??
              query.contractAddress ??
              ''
            ).toLowerCase(),
          }),
        }
        return readMerged({
          cursor: query.cursor,
          pageSize,
          readFirst: (after) =>
            readV2Events(where, query.order, after, pageSize, context, signal),
          readSecond: () => okAsync(EMPTY_PAGE),
          compare: byBlock(query.order),
          keyOf: (event) => event.id,
        }).map((page) => filterHistory(page, query))
      })
    },

    getRegistry: ({ address, pageSize, cursor }, options) =>
      zigens<{ registry: RegistryRow | null }>(
        V2.REGISTRY,
        {
          address: address.toLowerCase(),
          first: toPageSize(pageSize),
          after: cursor,
        },
        options?.signal,
      ).map(({ registry }) => registry && toRegistry(registry)),

    getRegistryLabels: (query, options) =>
      zigens<{ registry: { labelConnection: Connection<V2Domain> } | null }>(
        V2.REGISTRY_LABELS,
        {
          address: query.address.toLowerCase(),
          where: {
            ...(query.owner && { owner: query.owner.toLowerCase() }),
            ...(query.excludeOwner && {
              owner_not: query.excludeOwner.toLowerCase(),
            }),
          },
          first: toPageSize(query.pageSize),
          after: query.cursor,
          orderBy: 'name',
          orderDirection: 'asc',
        },
        options?.signal,
      ).map(({ registry }) => {
        const connection = registry?.labelConnection
        return {
          items: (connection?.edges ?? []).map(({ node }) =>
            toRegistryLabel(node, query.includeCounts),
          ),
          nextCursor: connection?.pageInfo.hasNextPage
            ? connection.pageInfo.endCursor
            : null,
          totalCount: connection?.totalCount ?? null,
        }
      }),

    getResolver: ({ address, pageSize, cursor }, options) => {
      const signal = options?.signal
      const size = toPageSize(pageSize)
      const variables = (skip: number) => ({
        address: address.toLowerCase(),
        first: size,
        skip,
      })
      return readMerged({
        cursor,
        pageSize: size,
        readFirst: (after) =>
          zigens<{ resolvers: readonly ResolverBinding[] }>(
            V2.RESOLVER_BINDINGS,
            variables(toSkip(after)),
            signal,
          ).map(({ resolvers }) =>
            fromSkipPage(resolvers, toSkip(after), size, toV2BoundName),
          ),
        readSecond: (after) =>
          ensNode<{
            resolvers: readonly {
              domain: Parameters<typeof toV1BoundName>[0] | null
            }[]
          }>(V1.RESOLVER_BINDINGS, variables(toSkip(after)), signal).map(
            ({ resolvers }) =>
              fromSkipPage(
                resolvers,
                toSkip(after),
                size,
                ({ domain }) =>
                  domain && toV1BoundName(domain, address, nameWrapper),
              ),
          ),
        // ENSv2 bindings first, then ENSv1; neither schema orders them alike.
        compare: () => -1,
        keyOf: (bound) => bound.namehash,
      }).map((boundNames) => ({
        address: toAccount(address) ?? address,
        mirrorRegistry: null,
        boundNames,
      }))
    },

    getResolverLinks: ({ address, pageSize, cursor }, options) => {
      const size = toPageSize(pageSize)
      const skip = toSkip(cursor)
      return zigens<{ resolvers: readonly ResolverBinding[] }>(
        V2.RESOLVER_BINDINGS,
        { address: address.toLowerCase(), first: size, skip },
        options?.signal,
      ).map(({ resolvers }) => ({
        items: resolvers.flatMap((binding) => toResolverLink(binding) ?? []),
        nextCursor: resolvers.length === size ? String(skip + size) : null,
        totalCount: null,
        isComplete: true,
      }))
    },

    getResolverRoles: ({ address, pageSize, cursor }, options) =>
      zigens<{ roleConnection: Connection<RoleAssignment> }>(
        V2.ROLE_CONNECTION,
        {
          first: toPageSize(pageSize),
          after: cursor,
          contract: address.toLowerCase(),
        },
        options?.signal,
      ).map(({ roleConnection }) => ({
        items: roleConnection.edges.flatMap(
          ({ node }) => toResolverRoleGrant(node) ?? [],
        ),
        nextCursor: roleConnection.pageInfo.hasNextPage
          ? roleConnection.pageInfo.endCursor
          : null,
        totalCount: roleConnection.totalCount,
        isComplete: true,
      })),

    getPermissions: ({ registry, pageSize, cursor }, options) =>
      zigens<{ roleConnection: Connection<RoleAssignment> }>(
        V2.ROLE_CONNECTION,
        {
          first: toPageSize(pageSize),
          after: cursor,
          contract: registry.toLowerCase(),
          resource: '0x0',
        },
        options?.signal,
      ).map(({ roleConnection }) => ({
        items: roleConnection.edges.flatMap(
          ({ node }) => toRootRoleGrant(node) ?? [],
        ),
        nextCursor: roleConnection.pageInfo.hasNextPage
          ? roleConnection.pageInfo.endCursor
          : null,
        totalCount: roleConnection.totalCount,
        // zigens lists every root assignment; there are no registry operators to leave out.
        isComplete: true,
        hasUnlistedOperators: false,
      })),

    getSyncStatus: (_, options) =>
      ResultAsync.combine([
        zigens<{ _meta: { block: { number: number } } }>(
          V2.META,
          {},
          options?.signal,
        ),
        ensNode<{ _meta: { block: { number: number } } }>(
          V1.META,
          {},
          options?.signal,
        ),
      ]).map(([v2, v1]) => ({
        // Synced means both sources are past the block.
        indexedBlock: Math.min(v2._meta.block.number, v1._meta.block.number),
      })),
  }
}
