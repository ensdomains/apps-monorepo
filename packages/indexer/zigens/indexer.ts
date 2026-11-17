import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import { type Client, namehash } from 'viem'
import type { V1Domain, V1Event } from '../ensnode/ensnode.types'
import { toV1HistoryEvent } from '../ensnode/history'
import {
  toV1BoundName,
  toV1NameSummary,
  toV1Relations,
  toV1Subname,
} from '../ensnode/names'
import * as V1 from '../ensnode/queries'
import {
  type RegisteredRow,
  toEventTimes,
  toMissingBlocks,
  toRegistrationIds,
  toRegistrationTimes,
} from '../ensnode/timestamps'
import type { IndexerClient } from '../reads/client.types'
import type { Page } from '../reads/common.types'
import { IndexerReadError } from '../reads/errors'
import type { HistoryEvent } from '../reads/history.types'
import type { Subname, SubnamesQuery } from '../reads/names.types'
import type {
  NameSummary,
  NamesForAddressQuery,
} from '../reads/namesForAddress.types'
import type { ResolverOverview } from '../reads/registry.types'
import { readBlockTimestamps } from '../shared/blockTimestamps'
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
import {
  isEth2ld,
  secondsToDate,
  toAccount,
  toUnixSeconds,
  V1_GRACE_SECONDS,
  V2_GRACE_SECONDS,
} from '../shared/values'
import {
  isChildOf,
  isLapsedInWindow,
  MAX_NAMES,
  type Sorted,
  toBatches,
  toOffsetPage,
  toRelations,
  toSortedComparator,
  toV1SortKey,
  toV1Variables,
  toV2SortKey,
  toV2Terms,
  toV2Variables,
  ZIGENS_NAME_LIMIT,
} from './filters'
import { type EventContext, toHistoryEvent } from './history'
import {
  canMatchType,
  type HistoryFilter,
  isWithinHistoryFilter,
  type RegistrationAnchor,
  toEventsWhere,
  toEventWhere,
  toHistoryStart,
} from './historyFilters'
import {
  isRegisteredV2,
  isStillHeld,
  pickNameDetail,
  toV2NameSummary,
  toV2Subname,
  withReservation,
} from './names'
import * as V2 from './queries'
import { type ResolverRecords, toRecordKeys } from './records'
import {
  isIndexedResolver,
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
  ResolverActivity,
  ResolverBinding,
  RoleAssignment,
  V2Domain,
  V2Event,
} from './zigens.types'

export type ZigensIndexerOptions = Readonly<{
  /** zigens GraphQL, read for ENSv2. */
  zigensGraphql: string
  /** ENSNode's subgraph-compatible GraphQL, read for ENSv1. */
  ensNodeSubgraph: string
  chainId: number
  /** The chain's NameWrapper, which tells a wrapped ENSv1 name from a stale wrapper token. */
  nameWrapper: string
  /** Reads the ENSv1 block timestamps the subgraph lacks; give it a batching transport. Without it they stay null. */
  rpcClient?: Client
  fetch?: typeof fetch
  timeoutMs?: number
  /** The clock registration status is decided against. */
  now?: () => Date
}>

const DEFAULT_PAGE_SIZE = 50
// zigens rejects a page of full domain rows past its query-complexity budget.
const MAX_PAGE_SIZE = 100
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

/** Every page of an ENSNode list, which pages by `skip`. */
const readAllSkipped = <Row>(
  readPage: (
    skip: number,
    first: number,
    signal?: AbortSignal,
  ) => ResultAsync<readonly Row[], IndexerReadError>,
  signal: AbortSignal | undefined,
) =>
  readAllPages({
    readPage: (cursor, pageSignal) => {
      const skip = toSkip(cursor)
      return readPage(skip, MAX_NAMES, pageSignal).map((rows) => ({
        rows,
        nextCursor:
          rows.length === MAX_NAMES ? String(skip + rows.length) : null,
      }))
    },
    isStaleError: isNeverStale,
    toStopError,
    signal,
  })

const namesOf = (domains: readonly Readonly<{ name: string | null }>[]) =>
  domains.flatMap(({ name }) => (name ? [name] : []))

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

// Adds subject terms to a filter, keeping a null that matches nothing.
const withWhere = (
  where: Readonly<Record<string, unknown>> | null,
  subject: Readonly<Record<string, unknown>>,
) => where && { ...subject, ...where }

const EMPTY_HISTORY: Page<HistoryEvent> = {
  items: [],
  nextCursor: null,
  totalCount: 0,
}

/** `IndexerClient` over zigens (ENSv2) and ENSNode (ENSv1); a merged read fails if either source fails. */
export const createZigensIndexer = ({
  zigensGraphql,
  ensNodeSubgraph,
  chainId,
  nameWrapper,
  rpcClient,
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
    ResultAsync.combine(
      toBatches(names, ZIGENS_NAME_LIMIT).map((batch) =>
        zigens<{ domains: readonly V2Domain[] }>(
          V2.DOMAINS_BY_NAMES,
          { names: batch },
          signal,
        ).map(({ domains }) => domains),
      ),
    ).map((batches) =>
      batches.flat().filter((domain) => domain.protocol === 'v2'),
    )

  const readV1Domains = (names: readonly string[], signal?: AbortSignal) =>
    ensNode<{ domains: readonly V1Domain[] }>(
      V1.DOMAINS_BY_NAMES,
      { names },
      signal,
    ).map(({ domains }) => domains)

  /** ENSv2 rows of these names, reservations of ENSv1 names included, by name. */
  const readReservations = (names: readonly string[], signal?: AbortSignal) =>
    readV2Domains(names, signal).map(
      (domains) =>
        new Map(domains.map((domain) => [domain.name ?? '', domain])),
    )

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
  ): ResultAsync<SourcePage<Sorted<NameSummary>>, IndexerReadError> => {
    const pageSize = toPageSize(query.pageSize)
    const roleNames = [...powersByName.keys()]
    const terms = toV2Terms(query, roleNames)
    if (query.protocol === 'v1' || terms.length === 0) {
      return okAsync(EMPTY_PAGE)
    }
    const toRow = (domain: V2Domain) => {
      if (query.parent && !isChildOf(domain.name ?? '', query.parent)) {
        return null
      }
      const item = toV2NameSummary(domain, {
        address: query.address,
        now: now(),
        powersByName,
        includeCounts: query.includeCounts,
        includeRoles: query.includeRoles,
      })
      return query.resolvesTo || isStillHeld(item)
        ? { item, key: toV2SortKey(domain, query) }
        : null
    }
    const readConnection = (
      anyOf: typeof terms,
      cursor: string | undefined,
      first: number,
      pageSignal?: AbortSignal,
    ) =>
      zigens<{ domainConnection: Connection<V2Domain> }>(
        V2.DOMAIN_CONNECTION,
        toV2Variables(query, anyOf, cursor, first),
        pageSignal,
      ).map(({ domainConnection }) => domainConnection)
    if (roleNames.length <= ZIGENS_NAME_LIMIT) {
      return readConnection(terms, after, pageSize, signal).map((connection) =>
        fromConnection(connection, toRow),
      )
    }
    // Too many role names for one filter: read each term in full, then page the union.
    return ResultAsync.combine(
      terms.map((term) =>
        readAllEdges(
          (cursor, pageSignal) =>
            readConnection([term], cursor, MAX_PAGE_SIZE, pageSignal),
          signal,
        ),
      ),
    ).map((lists) =>
      toOffsetPage(
        [...new Map(lists.flat().map((domain) => [domain.id, domain])).values()]
          .flatMap((domain) => toRow(domain) ?? [])
          .sort(toSortedComparator(query)),
        after,
        pageSize,
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
    const variables = toV1Variables(query, skip, pageSize, {
      now: now(),
      nameWrapper,
    })
    if (query.protocol === 'v2' || variables === null) {
      return okAsync<SourcePage<Sorted<NameSummary>>, IndexerReadError>(
        EMPTY_PAGE,
      )
    }
    const relations = toRelations(query)
    return ensNode<{ domains: readonly V1Domain[] }>(
      V1.DOMAINS,
      variables,
      signal,
    ).andThen(({ domains }) =>
      readReservations(namesOf(domains), signal).map((reservations) =>
        fromSkipPage(domains, skip, pageSize, (domain) => {
          if (
            !query.resolvesTo &&
            !toV1Relations(domain, query.address, nameWrapper).some(
              (relation) => relations.includes(relation),
            )
          ) {
            return null
          }
          const item = withReservation(
            toV1NameSummary(domain, {
              address: query.address,
              now: now(),
              nameWrapper,
              includeCounts: query.includeCounts,
              includeRoles: query.includeRoles,
            }),
            reservations.get(domain.name ?? ''),
            now(),
          )
          return query.resolvesTo || isStillHeld(item)
            ? { item, key: toV1SortKey(domain, query) }
            : null
        }),
      ),
    )
  }

  // A null filter cannot match any zigens type, so the source is empty.
  const readV2Events = (
    where: Readonly<Record<string, unknown>> | null,
    order: 'asc' | 'desc' | undefined,
    after: string | undefined,
    pageSize: number,
    context: EventContext,
    signal?: AbortSignal,
  ): ResultAsync<SourcePage<HistoryEvent>, IndexerReadError> =>
    where === null
      ? okAsync(EMPTY_PAGE)
      : zigens<{ eventConnection: Connection<V2Event> }>(
          V2.EVENT_CONNECTION,
          { where, first: pageSize, after, orderDirection: order ?? 'desc' },
          signal,
        ).map(({ eventConnection }) =>
          fromConnection(eventConnection, (event) =>
            toHistoryEvent(event, context),
          ),
        )

  /** ENSv1 event times: the registration date for each latest registration, then block timestamps over RPC. */
  const readEventTimes = (events: readonly V1Event[], signal?: AbortSignal) => {
    const ids = toRegistrationIds(events)
    const registrationTimes =
      ids.length === 0
        ? okAsync<ReadonlyMap<string, bigint>, IndexerReadError>(new Map())
        : ensNode<{ nameRegistereds: readonly RegisteredRow[] }>(
            V1.LATEST_REGISTRATIONS,
            { ids },
            signal,
          ).map(({ nameRegistereds }) => toRegistrationTimes(nameRegistereds))
    return registrationTimes.andThen((byEvent) => {
      const missing = toMissingBlocks(events, byEvent)
      const blockTimes =
        rpcClient && missing.length > 0
          ? readBlockTimestamps(rpcClient, missing)
          : okAsync<ReadonlyMap<number, bigint>, IndexerReadError>(new Map())
      return blockTimes.map((byBlock) => toEventTimes(events, byEvent, byBlock))
    })
  }

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
              { expiryDate_gt: toUnixSeconds(at).toString() },
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

  // zigens filters on the server too; ENSNode cannot, so every page passes through here.
  const filterHistory = (
    page: Page<HistoryEvent>,
    filter: HistoryFilter,
  ): Page<HistoryEvent> => ({
    ...page,
    items: page.items.filter(isWithinHistoryFilter(filter)),
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
          compare: toSortedComparator(query),
          keyOf: ({ item }) => item.namehash,
        }).map((page) => ({
          ...page,
          items: query.resolvesTo
            ? page.items.map(({ item: summary }) => ({
                ...summary,
                resolvedCoinTypes: [60],
              }))
            : page.items.map(({ item }) => item),
        })),
      )
    },

    getGraceNames: ({ address, now: at }, options) => {
      const nowSeconds = toUnixSeconds(at)
      return readAllEdges(
        (after, signal) =>
          zigens<{ domainConnection: Connection<V2Domain> }>(
            V2.DOMAIN_CONNECTION,
            {
              where: {
                owner: address.toLowerCase(),
                name_ends_with: '.eth',
                // zigens takes unix seconds as a GraphQL Int.
                expiry_lte: Number(nowSeconds),
                expiry_gt: Number(nowSeconds - V2_GRACE_SECONDS),
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

    getLapsedNames: ({ address, now: at, since }, options) => {
      const signal = options?.signal
      const account = address.toLowerCase()
      const v2 = readAllEdges(
        (after, pageSignal) =>
          zigens<{ domainConnection: Connection<V2Domain> }>(
            V2.DOMAIN_CONNECTION,
            {
              where: {
                owner: account,
                name_ends_with: '.eth',
                // zigens takes unix seconds as a GraphQL Int.
                expiry_lte: Number(toUnixSeconds(at)),
                expiry_gt: Number(toUnixSeconds(since)),
                includeUnreachable: true,
              },
              first: MAX_PAGE_SIZE,
              after,
              orderBy: 'expiryDate',
              orderDirection: 'asc',
            },
            pageSignal,
          ).map(({ domainConnection }) => domainConnection),
        signal,
      ).map((domains) =>
        domains.map((domain) =>
          toV2NameSummary(domain, {
            address,
            now: at,
            powersByName: new Map(),
          }),
        ),
      )
      // A `.eth` 2LD's subgraph expiry is its lease plus the grace.
      const v1 = readAllSkipped(
        (skip, first, pageSignal) =>
          ensNode<{ domains: readonly V1Domain[] }>(
            V1.DOMAINS,
            {
              where: {
                parent: namehash('eth'),
                or: [{ registrant: account }, { wrappedOwner: account }],
                expiryDate_gt: (
                  toUnixSeconds(since) + V1_GRACE_SECONDS
                ).toString(),
                expiryDate_lte: (
                  toUnixSeconds(at) + V1_GRACE_SECONDS
                ).toString(),
              },
              first,
              skip,
              orderBy: 'expiryDate',
              orderDirection: 'asc',
            },
            pageSignal,
          ).map(({ domains }) => domains),
        signal,
      ).andThen((domains) =>
        readReservations(namesOf(domains), signal).map((reservations) =>
          domains.map((domain) =>
            withReservation(
              toV1NameSummary(domain, { address, now: at, nameWrapper }),
              reservations.get(domain.name ?? ''),
              at,
            ),
          ),
        ),
      )
      return ResultAsync.combine([v2, v1]).map((sources) =>
        sources
          .flat()
          .filter((summary) => isLapsedInWindow(summary, since, at))
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
      return ResultAsync.combine([
        readV2Domains([query.name], signal),
        readV1Domains([query.name], signal),
      ]).andThen(([[v2], [v1]]) => {
        if (!v2 && !v1) {
          return okAsync<Page<HistoryEvent> | null, IndexerReadError>(null)
        }
        if (v2 && isRegisteredV2(v2)) {
          const from = toHistoryStart(query, secondsToDate(v2.registrationDate))
          return readMerged({
            cursor: query.cursor,
            pageSize,
            readFirst: (after) =>
              readV2Events(
                withWhere(toEventWhere({ ...query, from }), {
                  namehash: v2.id,
                }),
                query.order,
                after,
                pageSize,
                eventContext,
                signal,
              ),
            readSecond: () => okAsync(EMPTY_PAGE),
            compare: byBlock(query.order),
            keyOf: (event) => event.id,
          }).map((page) => filterHistory(page, { ...query, from }))
        }
        // The current registration began at its latest NameRegistered.
        const v1From = toHistoryStart(
          query,
          secondsToDate(v1?.registration?.registrationDate),
        )
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
        const toPage = (
          events: readonly V1Event[],
          name: string | null,
          skip: number,
        ) =>
          readEventTimes(events, signal).map((times) =>
            fromSkipPage(events, skip, pageSize, (event) =>
              toV1HistoryEvent(event, {
                chainId,
                name,
                timestamp: secondsToDate(times.get(event.id)),
              }),
            ),
          )
        return readMerged({
          cursor: query.cursor,
          pageSize,
          readFirst: (cursor) =>
            read(toSkip(cursor), 0).andThen(({ domain }) =>
              toPage(
                domain?.events ?? [],
                domain?.name ?? null,
                toSkip(cursor),
              ),
            ),
          readSecond: (cursor) =>
            read(0, toSkip(cursor)).andThen(({ domain }) =>
              toPage(
                domain?.registration?.events ?? [],
                domain?.name ?? null,
                toSkip(cursor),
              ),
            ),
          compare: byBlock(order),
          keyOf: (event) => event.id,
        }).map((page) => filterHistory(page, { ...query, from: v1From }))
      })
    },

    getAddressHistory: (query, options) => {
      const signal = options?.signal
      const pageSize = toPageSize(query.pageSize)
      const order = query.order ?? 'desc'
      // ENSNode lists only an address's registrations, so other types leave it out.
      const hasV1Rows = canMatchType(query, 'registration')
      return readMerged({
        cursor: query.cursor,
        pageSize,
        readFirst: (after) =>
          readV2Events(
            withWhere(toEventWhere(query), {
              involved: query.address.toLowerCase(),
              protocol: 'v2',
            }),
            order,
            after,
            pageSize,
            eventContext,
            signal,
          ),
        readSecond: (cursor) => {
          if (!hasV1Rows) {
            return okAsync<SourcePage<HistoryEvent>, IndexerReadError>(
              EMPTY_PAGE,
            )
          }
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
          ).andThen(({ nameRegistereds }) =>
            readEventTimes(nameRegistereds, signal).map((times) =>
              fromSkipPage(nameRegistereds, skip, pageSize, (event) =>
                toV1HistoryEvent(event, {
                  chainId,
                  name: event.registration?.domain.name ?? null,
                  timestamp: secondsToDate(times.get(event.id)),
                }),
              ),
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
        RegistrationAnchor | null,
        IndexerReadError
      > = query.registrationId
        ? zigens<{
            domains: readonly Readonly<{
              id: string
              registrationDate: number | null
            }>[]
          }>(V2.DOMAIN_BY_TOKEN, { tokenId: query.registrationId }, signal).map(
            ({ domains: [domain] }) =>
              domain
                ? {
                    namehash: domain.id,
                    registeredAt: secondsToDate(domain.registrationDate),
                  }
                : null,
          )
        : okAsync<null, IndexerReadError>(null)
      return registration.andThen((anchor) => {
        const where = toEventsWhere(query, anchor)
        if (where === null) {
          return okAsync<Page<HistoryEvent>, IndexerReadError>(EMPTY_HISTORY)
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
        if (!registry) return null
        const connection = registry.labelConnection
        return {
          items: connection.edges.map(({ node }) =>
            toRegistryLabel(node, query.includeCounts),
          ),
          nextCursor: connection.pageInfo.hasNextPage
            ? connection.pageInfo.endCursor
            : null,
          totalCount: connection.totalCount ?? null,
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
      const isIndexed = ResultAsync.combine([
        zigens<ResolverActivity>(
          V2.RESOLVER_ACTIVITY,
          { address: address.toLowerCase() },
          signal,
        ),
        ensNode<{ resolvers: readonly unknown[] }>(
          V1.RESOLVER_EXISTS,
          { address: address.toLowerCase() },
          signal,
        ),
      ]).map(([v2, { resolvers }]) => isIndexedResolver(v2, resolvers))
      const boundNames = readMerged({
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
      })
      return ResultAsync.combine([isIndexed, boundNames]).map(
        ([indexed, names]): ResolverOverview | null =>
          indexed
            ? {
                address: toAccount(address) ?? address,
                mirrorRegistry: null,
                boundNames: names,
              }
            : null,
      )
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
        completeness: 'full',
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
        completeness: 'full',
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
        completeness: 'full',
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
