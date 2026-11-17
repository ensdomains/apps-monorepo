import { errAsync, okAsync, type ResultAsync } from 'neverthrow'
import type { IndexerClient } from '../reads/client.types'
import type { IndexerReadError } from '../reads/errors'
import type {
  AddressHistoryQuery,
  EventsQuery,
  NameHistoryQuery,
} from '../reads/history.types'
import { DEFAULT_TIMEOUT_MS } from '../shared/graphql'
import { toReadError } from './adapters'
import { type BignameClientOptions, createBignameClient } from './client'
import type { BignameError } from './errors'
import { readGraceNames } from './grace'
import { toHistoryEvent } from './history'
import { readNameDetail, toNameDetail } from './nameDetail'
import { toGraceSummary, toRecordKeys, toSubname, toSyncStatus } from './names'
import { readNamesForAddress } from './namesForAddress'
import {
  toRegistry,
  toRegistryLabels,
  toResolverLinks,
  toResolverOverview,
  toResolverRoles,
  toRootRoleGrants,
} from './registry'
import { secondsToTimestamp } from './time'
import type * as T from './types'

export type BignameIndexerOptions = Readonly<{
  baseUrl: string
  /** The chain the deployment indexes, which keys its resolver and registry routes. */
  chainId: number
  apiVersion?: BignameClientOptions['apiVersion']
  fetch?: typeof fetch
  timeoutMs?: number
}>

/** A missing resource is an answer: the read resolves to `fallback`. */
const orWhenNotFound =
  <T>(fallback: T) =>
  (error: BignameError): ResultAsync<T, IndexerReadError> =>
    error.code === 'not_found'
      ? okAsync(fallback)
      : errAsync(toReadError(error))

const toSeconds = (date: Date | undefined) =>
  date === undefined ? undefined : secondsToTimestamp(date)

const toHistoryFilters = (
  query: NameHistoryQuery | EventsQuery | AddressHistoryQuery,
) => ({
  type: query.types,
  kind: query.kinds,
  record_key: query.recordKey,
  order: query.order,
  from_timestamp: toSeconds(query.from),
  to_timestamp: toSeconds(query.to),
  page_size: query.pageSize,
  cursor: query.cursor,
})

const toInclude = (
  query: Readonly<{ includeTotal?: boolean }>,
): readonly T.HistoryIncludeToken[] => [
  'data',
  'raw',
  ...(query.includeTotal ? (['total_count'] as const) : []),
]

const toHistoryPage = (
  envelope: T.Envelope<readonly (T.EventRow | T.NameHistoryRow)[]>,
) => ({
  items: envelope.data.map(toHistoryEvent),
  nextCursor: envelope.page?.next_cursor ?? null,
  totalCount: envelope.page?.total_count ?? null,
})

const EMPTY_PAGE = { items: [], nextCursor: null, totalCount: 0 } as const

// bigname keys its contract routes by lower-cased address.
const contract = (address: string) => address.toLowerCase()

// Unscoped, bigname also answers for other namespaces such as Basenames.
const NAMESPACE = 'ens'

/** `IndexerClient` over bigname's REST API, which serves ENSv1 and ENSv2 together. */
export const createBignameIndexer = ({
  baseUrl,
  chainId,
  apiVersion,
  fetch: fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: BignameIndexerOptions): IndexerClient => {
  const client = createBignameClient(baseUrl, {
    apiVersion,
    // The caller's signal still cancels the request; the timeout only adds a limit.
    fetch: (input, init) =>
      fetchImpl(input, {
        ...init,
        signal: AbortSignal.any([
          ...(init?.signal ? [init.signal] : []),
          AbortSignal.timeout(timeoutMs),
        ]),
      }),
  })
  return {
    getNameDetail: readNameDetail(client),

    getNames: ({ names }, options) =>
      client
        .lookup(
          {
            namespace: NAMESPACE,
            profile: 'detail',
            inputs: names.map((name) => ({ name })),
          },
          options,
        )
        .map(({ data }) =>
          data.map((result) =>
            result.status === 'ok' && result.record
              ? toNameDetail(result.record)
              : null,
          ),
        )
        .mapErr(toReadError),

    getNamesForAddress: readNamesForAddress(client),

    getGraceNames: ({ address, now }, options) =>
      readGraceNames(
        client,
        address,
        BigInt(Math.floor(now.getTime() / 1000)),
        options?.signal,
      )
        .map((rows) => rows.map(toGraceSummary))
        .mapErr(toReadError),

    getSubnames: (
      { name, includeExpired, includeCounts, pageSize, cursor },
      options,
    ) =>
      client
        .subnames(
          name,
          {
            namespace: NAMESPACE,
            sort: 'name',
            include_expired: includeExpired ? 'true' : 'false',
            include: includeCounts ? ['counts'] : undefined,
            page_size: pageSize,
            cursor,
          },
          options,
        )
        .map(({ data, page }) => ({
          items: data.map(toSubname),
          nextCursor: page?.next_cursor ?? null,
          totalCount: page?.total_count ?? null,
        }))
        .orElse(orWhenNotFound(EMPTY_PAGE)),

    getRecordKeys: ({ name, resolver }, options) =>
      (resolver
        ? client.resolverRecords(
            chainId,
            contract(resolver),
            { name, values: false, include: ['inventory'] },
            options,
          )
        : client.nameRecords(
            name,
            { namespace: NAMESPACE, include: ['inventory'] },
            options,
          )
      )
        .map(({ data }) => toRecordKeys(data))
        .orElse(orWhenNotFound(null)),

    getNameHistory: (query, options) =>
      client
        .nameHistory(
          query.name,
          {
            ...toHistoryFilters(query),
            namespace: NAMESPACE,
            scope: query.scope,
            include: [
              ...toInclude(query),
              ...(query.includeChildRegistrations
                ? (['child_registrations'] as const)
                : []),
            ],
          },
          options,
        )
        .map(toHistoryPage)
        .orElse(orWhenNotFound(EMPTY_PAGE)),

    getAddressHistory: (query, options) =>
      client
        .addressHistory(
          query.address,
          {
            ...toHistoryFilters(query),
            relation: 'any',
            include: toInclude(query),
          },
          options,
        )
        .map(toHistoryPage)
        .mapErr(toReadError),

    getEvents: (query, options) =>
      client
        .events(
          {
            ...toHistoryFilters(query),
            name: query.name,
            address: query.address,
            resolver:
              query.resolver && `${chainId}:${contract(query.resolver)}`,
            contract_address: query.contractAddress,
            registration_id: query.registrationId,
            include: toInclude(query),
          },
          options,
        )
        .map(toHistoryPage)
        .mapErr(toReadError),

    getRegistry: ({ address, pageSize, cursor }, options) =>
      client
        .registry(
          chainId,
          contract(address),
          { include: ['counts'], page_size: pageSize, cursor },
          options,
        )
        .map(({ data }) => toRegistry(data))
        .orElse(orWhenNotFound(null)),

    getRegistryLabels: (query, options) =>
      client
        .registryLabels(
          chainId,
          contract(query.address),
          {
            owner: query.owner,
            exclude_owner: query.excludeOwner,
            include: query.includeCounts ? ['counts'] : undefined,
            page_size: query.pageSize,
            cursor: query.cursor,
          },
          options,
        )
        .map(toRegistryLabels)
        .mapErr(toReadError),

    getResolver: ({ address, pageSize, cursor }, options) =>
      client
        .resolver(
          chainId,
          contract(address),
          { page_size: pageSize, cursor },
          options,
        )
        .map(({ data }) => toResolverOverview(data))
        .orElse(orWhenNotFound(null)),

    getResolverLinks: ({ address, pageSize, cursor }, options) =>
      client
        .resolverLinks(
          chainId,
          contract(address),
          { page_size: pageSize, cursor },
          options,
        )
        .map(toResolverLinks)
        .mapErr(toReadError),

    getResolverRoles: ({ address, pageSize, cursor }, options) =>
      client
        .resolverRoles(
          chainId,
          contract(address),
          { page_size: pageSize, cursor },
          options,
        )
        .map(toResolverRoles)
        .mapErr(toReadError),

    getPermissions: ({ registry, pageSize, cursor }, options) =>
      client
        .permissions(
          {
            registry: `${chainId}:${contract(registry)}`,
            page_size: pageSize,
            cursor,
          },
          options,
        )
        .map((envelope) => toRootRoleGrants(envelope, registry))
        .mapErr(toReadError),

    getSyncStatus: (_, options) =>
      client
        .status(options)
        .map(({ data }) => toSyncStatus(data, chainId))
        .mapErr(toReadError),
  }
}

/** Goldsky serves bigname's routes and shapes under `/v2`; it indexes mainnet and Base only. */
export const createGoldskyIndexer = (
  options: Omit<BignameIndexerOptions, 'apiVersion'>,
): IndexerClient => createBignameIndexer({ ...options, apiVersion: 'v2' })
