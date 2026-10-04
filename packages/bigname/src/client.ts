import { BignameError, isBignameError } from './errors'
import { pathSegment, type QueryParams } from './query'
import {
  DEFAULT_RETRY,
  NO_RETRY,
  type RawRequest,
  type RequestContext,
  type RequestOptions,
  type RetryOptions,
  sendRequest,
} from './request'
import type {
  AddressNameRow,
  Authority,
  AuthorityRelation,
  BignamePage,
  BignameResponse,
  ContractRef,
  Finality,
  HistoryEvent,
  HistoryEventType,
  LookupInput,
  LookupProfile,
  LookupResult,
  NameDetail,
  NameListRow,
  NameRecords,
  Namespace,
  NamespaceInfo,
  PermissionsPage,
  PrimaryName,
  Registry,
  RegistryLabelRow,
  ResolverAliasRow,
  ResolverLinkRow,
  ResolverOverview,
  ResolverRoleRow,
  Status,
  SubnameRow,
} from './types'

/** Largest `page_size` any bigname collection accepts. */
export const MAX_PAGE_SIZE = 200

/** RFC 3339 string or Date (serialized with `toISOString`). */
export type TimestampParam = string | Date

type SortOrder = 'asc' | 'desc'
type ListOf<T> = T | readonly T[]

interface PageParams {
  readonly cursor?: string
  /** Default 50, maximum `MAX_PAGE_SIZE`. */
  readonly page_size?: number
}

/** Snapshot selectors accepted by single-resource reads. */
interface SnapshotParams {
  /** RFC 3339 instant or a `meta.as_of_token` from an earlier response. */
  readonly at?: TimestampParam
  readonly finality?: Finality
}

export interface GetNameParams extends SnapshotParams {
  readonly namespace?: Namespace
  readonly source?: 'indexed' | 'verified'
  readonly include?: readonly 'counts'[]
}

export interface GetNameRecordsParams extends SnapshotParams {
  readonly namespace?: Namespace
  readonly source?: 'indexed' | 'verified' | 'auto'
  /** Record keys (see `textKey`, `addrKey`); at most 200. Omit for the inventory default set. */
  readonly keys?: readonly string[]
  readonly include?: readonly 'inventory'[]
}

export interface ListSubnamesParams extends PageParams {
  readonly namespace?: Namespace
  /** ENSIP-15 prefix; one trailing dot marks a label boundary. */
  readonly q?: string
  readonly sort?: 'name' | 'expires_at' | 'registered_at'
  readonly order?: SortOrder
  /** Default true. `false` drops released and past-expiry children. */
  readonly include_expired?: boolean
  readonly include?: readonly 'counts'[]
}

export type HistoryInclude = 'data' | 'raw' | 'total_count'

interface HistoryFilterParams extends PageParams {
  readonly type?: ListOf<HistoryEventType>
  /** Default `desc` (newest first). */
  readonly order?: SortOrder
  readonly from_timestamp?: TimestampParam
  readonly to_timestamp?: TimestampParam
}

export interface NameHistoryParams extends HistoryFilterParams {
  readonly namespace?: Namespace
  /** Default `both`. */
  readonly scope?: 'name' | 'registration' | 'both'
  /** `child_registrations` is rejected for `eth` and `base.eth`. */
  readonly include?: readonly (HistoryInclude | 'child_registrations')[]
}

/** `any`, or a set of `owner`, `manager`, `registrant`. */
export type AuthorityRelationParam = 'any' | readonly AuthorityRelation[]

export interface AddressHistoryParams extends HistoryFilterParams {
  /** Defaults to `ens` server-side. */
  readonly namespace?: Namespace
  readonly relation?: AuthorityRelationParam
  readonly scope?: 'name' | 'registration' | 'both'
  readonly include?: readonly HistoryInclude[]
}

export interface ListEventsParams extends HistoryFilterParams {
  readonly namespace?: Namespace
  readonly name?: string
  readonly address?: string
  /** One resolver contract; serialized as `<chain_id>:<address>`. */
  readonly resolver?: ContractRef | string
  readonly contract_address?: string
  readonly registration_id?: string
  readonly from_block?: number
  readonly to_block?: number
  readonly include?: readonly HistoryInclude[]
}

export interface ListAddressNamesParams extends PageParams {
  readonly namespace?: Namespace
  /** Authority relations, or `resolves_to` alone. Server default is `any`. */
  readonly relation?: AuthorityRelationParam | 'resolves_to'
  readonly authority?: Authority
  /** Proven ENSv1→ENSv2 migration; rejected with `resolves_to`. */
  readonly is_migrated?: boolean
  /** Only with `relation=resolves_to`: a decimal coin type (default 60) or `evm`. */
  readonly coin_type?: number | 'evm'
  /** ENSIP-15 prefix match on `name`. */
  readonly q?: string
  readonly sort?: 'name' | 'expires_at' | 'registered_at'
  readonly order?: SortOrder
  /** Default `name`. */
  readonly dedupe?: 'name' | 'registration'
  readonly include?: readonly ('counts' | 'role_summary')[]
}

export interface GetPrimaryNameParams {
  /** Default 60. */
  readonly coin_type?: number
  /** Default `ens`. */
  readonly namespace?: Namespace
  /** Omit for both indexed and verified answers. */
  readonly source?: 'indexed' | 'verified'
}

export interface LookupRequest {
  /** At most 1000 inputs. */
  readonly inputs: readonly LookupInput[]
  readonly profile: LookupProfile
  readonly namespace?: Namespace
  /** `inventory` requires `profile: 'detail'`. */
  readonly include?: readonly 'inventory'[]
}

type ExpiryWindow =
  | {
      readonly expires_after: TimestampParam
      readonly expires_before?: TimestampParam
    }
  | {
      readonly expires_after?: TimestampParam
      readonly expires_before: TimestampParam
    }

/** `GET /v1/names`: `expires_after` inclusive, `expires_before` exclusive. */
export type ListNamesParams = ExpiryWindow &
  PageParams & {
    readonly namespace: Namespace
    readonly sort?: 'expires_at'
    /** Default `asc`. */
    readonly order?: SortOrder
  }

export interface SearchParams extends PageParams {
  readonly q: string
  readonly match?: 'prefix' | 'contains'
  readonly namespace?: Namespace
}

/** At least one of `name`, `registration_id`, `address` is required. */
export interface ListPermissionsParams extends PageParams {
  readonly name?: string
  readonly registration_id?: string
  readonly address?: string
  readonly namespace?: Namespace
  readonly include?: readonly 'lineage'[]
}

export interface GetRegistryParams extends SnapshotParams, PageParams {
  readonly include?: readonly 'counts'[]
}

export interface ListRegistryLabelsParams extends PageParams {
  readonly include?: readonly 'counts'[]
}

/** Resolver overview (`cursor`/`page_size` page `bound_names`) and its sub-collections. */
export interface ResolverParams extends SnapshotParams, PageParams {}

export interface BignameClientConfig {
  /** Resolved by `@ens-apps/config` (`endpoints.bignameApi`). Required: there is no default deployment. */
  readonly baseUrl: string
  /** Defaults to `globalThis.fetch`, looked up per request. */
  readonly fetch?: typeof fetch
  /** Backoff for 408/429/502/503/504, network errors and retryable `409 stale`. `false` disables. */
  readonly retry?: RetryOptions | false
  /** Extra headers sent with every request. */
  readonly headers?: Readonly<Record<string, string>>
}

/** Route params are flat objects of `QueryValue`s; `buildQuery` drops absent ones. */
const toQuery = (params: object | undefined): QueryParams =>
  (params ?? {}) as QueryParams

const formatResolverFilter = (resolver: ContractRef | string): string =>
  typeof resolver === 'string'
    ? resolver
    : `${resolver.chain_id}:${resolver.address}`

const isEnvelope = (value: unknown): value is { data: unknown } =>
  typeof value === 'object' && value !== null && 'data' in value

/** Resolve to `null` instead of rejecting when bigname answers `404 not_found`. */
export const nullOnNotFound = async <T>(
  promise: Promise<T>,
): Promise<T | null> => {
  try {
    return await promise
  } catch (error) {
    if (isBignameError(error, 'not_found')) return null
    throw error
  }
}

/**
 * Create a bigname client. Plain `fetch`, no React: safe in the browser,
 * TanStack Router `beforeLoad`, Cloudflare workerd and Node.
 *
 * Every method rejects with `BignameError`. Single-resource getters whose
 * "not indexed" answer is normal (`getName`, `getNameRecords`, `getRegistry`,
 * `getResolver`) resolve to `null` on 404 instead.
 */
export const createBignameClient = (config: BignameClientConfig) => {
  const baseUrl = config.baseUrl.trim()
  if (!baseUrl) {
    throw new Error(
      'bigname: no base URL. Pass the network config endpoint (endpoints.bignameApi).',
    )
  }
  const context: RequestContext = {
    baseUrl,
    fetch: config.fetch ?? ((input, init) => globalThis.fetch(input, init)),
    retry:
      config.retry === false ? NO_RETRY : { ...DEFAULT_RETRY, ...config.retry },
    headers: config.headers ?? {},
  }

  /** Escape hatch for routes without a typed helper. Returns the raw envelope. */
  const request = async <TEnvelope>(raw: RawRequest): Promise<TEnvelope> => {
    const body = await sendRequest<unknown>(context, raw)
    if (!isEnvelope(body)) {
      throw new BignameError({
        status: 200,
        code: 'internal_error',
        message: 'bigname response is missing the data envelope',
        url: raw.path,
      })
    }
    return body as TEnvelope
  }

  const getResource = <TData>(
    path: string,
    params: object | undefined,
    options: RequestOptions | undefined,
  ): Promise<BignameResponse<TData>> =>
    request({
      path,
      query: toQuery(params),
      signal: options?.signal,
      retryStale: true,
    })

  /**
   * Current-state collections bind cursors to a publication: a `409 stale`
   * continuation is dead, so it is not retried here (the pager restarts).
   * History walks survive publications, so their cursors are retried.
   */
  const getCollection = <TPage>(
    path: string,
    params: (object & { readonly cursor?: string }) | undefined,
    options: RequestOptions | undefined,
    kind: 'current' | 'walk',
  ): Promise<TPage> =>
    request({
      path,
      query: toQuery(params),
      signal: options?.signal,
      retryStale: kind === 'walk' || params?.cursor === undefined,
    })

  const names = (name: string) => `/v1/names/${pathSegment(name)}`
  const addresses = (address: string) => `/v1/addresses/${pathSegment(address)}`
  const registries = (chainId: number, address: string) =>
    `/v1/registries/${pathSegment(chainId)}/${pathSegment(address)}`
  const resolvers = (chainId: number, address: string) =>
    `/v1/resolvers/${pathSegment(chainId)}/${pathSegment(address)}`

  return {
    baseUrl,
    request,

    /** `GET /v1/status`: per-chain indexing readiness. */
    getStatus: (options?: RequestOptions): Promise<BignameResponse<Status>> =>
      getResource('/v1/status', undefined, options),

    /** `GET /v1/names/{name}`. `null` when the name is not indexed (404). */
    getName: (
      name: string,
      params?: GetNameParams,
      options?: RequestOptions,
    ): Promise<BignameResponse<NameDetail> | null> =>
      nullOnNotFound(getResource(names(name), params, options)),

    /** `GET /v1/names/{name}/records`. `null` when the name is not indexed (404). */
    getNameRecords: (
      name: string,
      params?: GetNameRecordsParams,
      options?: RequestOptions,
    ): Promise<BignameResponse<NameRecords> | null> =>
      nullOnNotFound(getResource(`${names(name)}/records`, params, options)),

    /** `GET /v1/names/{name}/subnames`. Rejects `not_found` for a missing parent. */
    listSubnames: (
      name: string,
      params?: ListSubnamesParams,
      options?: RequestOptions,
    ): Promise<BignamePage<SubnameRow>> =>
      getCollection(`${names(name)}/subnames`, params, options, 'current'),

    /** `GET /v1/names/{name}/history`. Rejects `not_found` for a missing name on the first page. */
    getNameHistory: (
      name: string,
      params?: NameHistoryParams,
      options?: RequestOptions,
    ): Promise<BignamePage<HistoryEvent>> =>
      getCollection(`${names(name)}/history`, params, options, 'walk'),

    /** `GET /v1/addresses/{address}/names`. */
    listAddressNames: (
      address: string,
      params?: ListAddressNamesParams,
      options?: RequestOptions,
    ): Promise<BignamePage<AddressNameRow>> =>
      getCollection(`${addresses(address)}/names`, params, options, 'current'),

    /** `GET /v1/addresses/{address}/primary-name`. Always 200 with in-band `status`. */
    getPrimaryName: (
      address: string,
      params?: GetPrimaryNameParams,
      options?: RequestOptions,
    ): Promise<BignameResponse<PrimaryName>> =>
      getResource(`${addresses(address)}/primary-name`, params, options),

    /** `GET /v1/addresses/{address}/history`. */
    getAddressHistory: (
      address: string,
      params?: AddressHistoryParams,
      options?: RequestOptions,
    ): Promise<BignamePage<HistoryEvent>> =>
      getCollection(`${addresses(address)}/history`, params, options, 'walk'),

    /** `GET /v1/events`. `total_count` is null unless name/address/registration_id/resolver anchors it. */
    listEvents: (
      params?: ListEventsParams,
      options?: RequestOptions,
    ): Promise<BignamePage<HistoryEvent>> => {
      const query = params && {
        ...params,
        resolver:
          params.resolver === undefined
            ? undefined
            : formatResolverFilter(params.resolver),
      }
      return getCollection('/v1/events', query, options, 'walk')
    },

    /** `POST /v1/lookup`: batched forward/reverse lookup with in-band per-input `status`. */
    lookup: (
      body: LookupRequest,
      options?: RequestOptions,
    ): Promise<BignameResponse<readonly LookupResult[]>> =>
      request({
        method: 'POST',
        path: '/v1/lookup',
        body: {
          ...body,
          include:
            body.include && body.include.length > 0
              ? body.include.join(',')
              : undefined,
        },
        signal: options?.signal,
        retryStale: true,
      }),

    /** `GET /v1/names`: namespace-wide expiry sweep. `total_count` is always null. */
    listNames: (
      params: ListNamesParams,
      options?: RequestOptions,
    ): Promise<BignamePage<NameListRow>> =>
      getCollection('/v1/names', params, options, 'current'),

    /** `GET /v1/search`: prefix or contains match over names. */
    search: (
      params: SearchParams,
      options?: RequestOptions,
    ): Promise<BignamePage<NameListRow>> =>
      getCollection('/v1/search', params, options, 'current'),

    /** `GET /v1/permissions`. Resource-bound reads carry top-level `restrictions`. */
    listPermissions: (
      params: ListPermissionsParams,
      options?: RequestOptions,
    ): Promise<PermissionsPage> =>
      getCollection('/v1/permissions', params, options, 'current'),

    /** `GET /v1/registries/{chain_id}/{address}`. `null` for an unknown registry (404). */
    getRegistry: (
      chainId: number,
      address: string,
      params?: GetRegistryParams,
      options?: RequestOptions,
    ): Promise<BignameResponse<Registry> | null> =>
      nullOnNotFound(
        request({
          path: registries(chainId, address),
          query: toQuery(params),
          signal: options?.signal,
          retryStale: params?.cursor === undefined,
        }),
      ),

    /** `GET /v1/registries/{chain_id}/{address}/labels`. */
    listRegistryLabels: (
      chainId: number,
      address: string,
      params?: ListRegistryLabelsParams,
      options?: RequestOptions,
    ): Promise<BignamePage<RegistryLabelRow>> =>
      getCollection(
        `${registries(chainId, address)}/labels`,
        params,
        options,
        'current',
      ),

    /** `GET /v1/resolvers/{chain_id}/{address}`. `null` when there is no overview (404). */
    getResolver: (
      chainId: number,
      address: string,
      params?: ResolverParams,
      options?: RequestOptions,
    ): Promise<BignameResponse<ResolverOverview> | null> =>
      nullOnNotFound(
        request({
          path: resolvers(chainId, address),
          query: toQuery(params),
          signal: options?.signal,
          retryStale: params?.cursor === undefined,
        }),
      ),

    /** `GET /v1/resolvers/{chain_id}/{address}/links` (ENSv2 record-ID resolvers). */
    listResolverLinks: (
      chainId: number,
      address: string,
      params?: ResolverParams,
      options?: RequestOptions,
    ): Promise<BignamePage<ResolverLinkRow>> =>
      getCollection(
        `${resolvers(chainId, address)}/links`,
        params,
        options,
        'current',
      ),

    /** `GET /v1/resolvers/{chain_id}/{address}/roles`. */
    listResolverRoles: (
      chainId: number,
      address: string,
      params?: ResolverParams,
      options?: RequestOptions,
    ): Promise<BignamePage<ResolverRoleRow>> =>
      getCollection(
        `${resolvers(chainId, address)}/roles`,
        params,
        options,
        'current',
      ),

    /** `GET /v1/resolvers/{chain_id}/{address}/aliases`. */
    listResolverAliases: (
      chainId: number,
      address: string,
      params?: ResolverParams,
      options?: RequestOptions,
    ): Promise<BignamePage<ResolverAliasRow>> =>
      getCollection(
        `${resolvers(chainId, address)}/aliases`,
        params,
        options,
        'current',
      ),

    /** `GET /v1/namespaces/{namespace}`: capability summary. */
    getNamespace: (
      namespace: Namespace,
      options?: RequestOptions,
    ): Promise<BignameResponse<NamespaceInfo>> =>
      getResource(
        `/v1/namespaces/${pathSegment(namespace)}`,
        undefined,
        options,
      ),
  }
}

export type BignameClient = ReturnType<typeof createBignameClient>
