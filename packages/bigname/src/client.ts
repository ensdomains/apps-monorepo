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
  EventRow,
  Finality,
  HistoryEvent,
  HistoryEventKind,
  HistoryEventType,
  LookupInput,
  LookupProfile,
  LookupResult,
  NameDetail,
  NameListRow,
  NameMatch,
  NameRecords,
  Namespace,
  NamespaceInfo,
  PermissionsPage,
  PrimaryName,
  Registry,
  RegistryLabelRow,
  ResolverLinkRow,
  ResolverOverview,
  ResolverRoleRow,
  Status,
  SubnameRow,
} from './types'

/** Largest `page_size` any bigname collection accepts. */
export const MAX_PAGE_SIZE = 200

/**
 * A timestamp query value: decimal Unix seconds as a `number`, `bigint` or
 * string (`"1791150000"`), an RFC 3339 string, or a `Date` (sent as RFC 3339
 * with milliseconds). bigname accepts both forms on every timestamp param.
 */
export type TimestampParam = string | number | bigint | Date

type SortOrder = 'asc' | 'desc'
type ListOf<T> = T | readonly T[]

interface PageParams {
  readonly cursor?: string
  /** Default 50, maximum `MAX_PAGE_SIZE`. */
  readonly page_size?: number
}

/** Snapshot selectors accepted by single-resource reads. */
interface SnapshotParams {
  /** A `TimestampParam` instant or a `meta.as_of_token` from an earlier response. */
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
  /** ENSIP-15 name text; one trailing dot marks a label boundary. */
  readonly q?: string
  /** Default `prefix`. */
  readonly match?: NameMatch
  readonly sort?: 'name' | 'expires_at' | 'registered_at'
  readonly order?: SortOrder
  /** Default true. `false` drops released and past-expiry children. */
  readonly include_expired?: boolean
  readonly include?: readonly 'counts'[]
}

export type HistoryInclude = 'data' | 'raw' | 'total_count'

/** Filters shared by name history, address history and `/v1/events`. */
interface HistoryFilterParams extends PageParams {
  readonly type?: ListOf<HistoryEventType>
  /** Removes types after `type`; exclusion wins. */
  readonly exclude_type?: ListOf<HistoryEventType>
  /** Raw kinds (the `include=raw` values); intersects the type filters. */
  readonly kind?: ListOf<HistoryEventKind>
  /** One exact stored record key (`addr:60`, `text:avatar`, `name`, `abi:16`); keeps record writes and resets. */
  readonly record_key?: string
  /** Default `desc` (newest first). */
  readonly order?: SortOrder
  /** Inclusive. */
  readonly from_timestamp?: TimestampParam
  /** Inclusive. */
  readonly to_timestamp?: TimestampParam
}

export interface NameHistoryParams extends HistoryFilterParams {
  readonly namespace?: Namespace
  /** Default `both`. */
  readonly scope?: 'name' | 'registration' | 'both'
  /** `child_registrations` is rejected for `eth` and `base.eth`. */
  readonly include?: readonly (HistoryInclude | 'child_registrations')[]
}

/** `any` (owner, manager and role_holder), or one or a set of authority relations. */
export type AuthorityRelationParam = 'any' | ListOf<AuthorityRelation>

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
  /** `total_count` is exact for anchored reads and for `contract_address` reads. */
  readonly include?: readonly HistoryInclude[]
}

export interface ListAddressNamesParams extends PageParams {
  readonly namespace?: Namespace
  /**
   * Authority relations (server default `any`), or `resolves_to` or
   * `former_owner` alone. `former_owner` lists released names the address
   * last held; it takes no `authority`, `is_migrated`, `q`, `coin_type` or
   * `include`, only `sort=expires_at` and name dedupe.
   */
  readonly relation?: AuthorityRelationParam | 'resolves_to' | 'former_owner'
  /** Served-authority set; rows that serve no authority match none. Not with `former_owner`. */
  readonly authority?: ListOf<Authority>
  /** Only names exactly one label below this name (`eth` → `.eth` 2LDs only). Every relation. */
  readonly parent?: string
  /** Proven ENSv1→ENSv2 migration; not with `resolves_to` or `former_owner`. */
  readonly is_migrated?: boolean
  /** Only with `relation=resolves_to`: a decimal coin type (default 60) or `evm`. */
  readonly coin_type?: number | 'evm'
  /** Only with `relation=former_owner`: inclusive `expires_at` bound. */
  readonly expires_after?: TimestampParam
  /** Only with `relation=former_owner`: exclusive `expires_at` bound. */
  readonly expires_before?: TimestampParam
  /** ENSIP-15 name text matched on `name`. */
  readonly q?: string
  /** Default `prefix`. */
  readonly match?: NameMatch
  /** Missing values sort smallest (first ascending). */
  readonly sort?: 'name' | 'expires_at' | 'registered_at' | 'created_at'
  readonly order?: SortOrder
  /** Default `name`. */
  readonly dedupe?: 'name' | 'registration'
  /**
   * `total_count` (after v0.4.1) asks the authority relations for an exact
   * `page.total_count` on an address with more than 1,000 candidate names,
   * where it is otherwise `null`. It reads every candidate, so send it on
   * the first page only (it does not bind cursors). Rejected with
   * `relation=resolves_to` or `former_owner`, and by v0.4.1 (see
   * `isUnsupportedIncludeError`), which always counts exactly without it.
   */
  readonly include?: readonly ('counts' | 'role_summary' | 'total_count')[]
}

export interface GetPrimaryNameParams {
  /** Default 60. */
  readonly coin_type?: number
  /** Default `ens`. */
  readonly namespace?: Namespace
  /** Omit for both indexed and verified answers. */
  readonly source?: 'indexed' | 'verified'
}

/** `POST /v1/lookup` body. The route takes no `include` (400). */
export interface LookupRequest<TProfile extends LookupProfile = 'detail'> {
  /** At most 1000 inputs. */
  readonly inputs: readonly LookupInput[]
  /** Server default `detail`. */
  readonly profile?: TProfile
  readonly namespace?: Namespace
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

/**
 * `GET /v1/names`: `expires_after` inclusive, `expires_before` exclusive; at
 * least one is required.
 */
export type ListNamesParams = ExpiryWindow &
  PageParams & {
    readonly namespace: Namespace
    /** Served-authority set; rows that serve no authority match none. */
    readonly authority?: ListOf<Authority>
    /** Only names exactly one label below this name (`eth` → `.eth` 2LDs only). */
    readonly parent?: string
    readonly sort?: 'expires_at'
    /** Default `asc`. */
    readonly order?: SortOrder
  }

export interface SearchParams extends PageParams {
  readonly q: string
  /** Default `prefix`. */
  readonly match?: NameMatch
  readonly namespace?: Namespace
}

/**
 * At least one of `name`, `registration_id`, `address` or `registry` is
 * required. `registry` combines with `address` only.
 */
export interface ListPermissionsParams extends PageParams {
  readonly name?: string
  readonly registration_id?: string
  readonly address?: string
  /**
   * After v0.4.1: one ENSv2 registry, serialized as `<chain_id>:<address>`.
   * Lists the current holders of its root resource (`grant_scope.kind:
   * 'root'`), or with `address` that account's root row. Not with `name` or
   * `registration_id`. An unknown registry answers an empty page. v0.4.1
   * rejects the parameter (see `isUnknownQueryParamError`).
   */
  readonly registry?: ContractRef | string
  readonly namespace?: Namespace
  readonly include?: readonly 'lineage'[]
}

export interface GetRegistryParams extends SnapshotParams, PageParams {
  readonly include?: readonly 'counts'[]
}

export interface ListRegistryLabelsParams extends PageParams {
  readonly include?: readonly 'counts'[]
  /** Labels held by this address. Not with `exclude_owner`. */
  readonly owner?: string
  /** Labels not held by this address, ownerless ones included. Not with `owner`. */
  readonly exclude_owner?: string
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

/** A contract filter value: `<chain_id>:<address>`. */
const formatContractFilter = (contract: ContractRef | string): string =>
  typeof contract === 'string'
    ? contract
    : `${contract.chain_id}:${contract.address}`

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

  /**
   * GET with `409 stale` retried: since v0.4.1 every cursor holds only its
   * sort position (no publication), so a stale page is retried with the same
   * cursor. The one exception is `getPinnedResolverRead`.
   */
  const get = <TEnvelope>(
    path: string,
    params: object | undefined,
    options: RequestOptions | undefined,
  ): Promise<TEnvelope> =>
    request({
      path,
      query: toQuery(params),
      signal: options?.signal,
      retryStale: true,
    })

  /**
   * Resolver collections pinned with `at` read current projections: once a
   * later block is published their continuation answers `409 stale` for good,
   * so it is not retried (the pager restarts the walk).
   */
  const getPinnedResolverRead = <TEnvelope>(
    path: string,
    params: ResolverParams | undefined,
    options: RequestOptions | undefined,
  ): Promise<TEnvelope> =>
    request({
      path,
      query: toQuery(params),
      signal: options?.signal,
      retryStale: params?.at === undefined || params.cursor === undefined,
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
      get('/v1/status', undefined, options),

    /**
     * `GET /v1/names/{name}`. `null` when the name is not indexed (404). A
     * label may be spelled `[<64 lowercase hex>]` (its labelhash).
     */
    getName: (
      name: string,
      params?: GetNameParams,
      options?: RequestOptions,
    ): Promise<BignameResponse<NameDetail> | null> =>
      nullOnNotFound(get(names(name), params, options)),

    /** `GET /v1/names/{name}/records`. `null` when the name is not indexed (404). */
    getNameRecords: (
      name: string,
      params?: GetNameRecordsParams,
      options?: RequestOptions,
    ): Promise<BignameResponse<NameRecords> | null> =>
      nullOnNotFound(get(`${names(name)}/records`, params, options)),

    /** `GET /v1/names/{name}/subnames`. Rejects `not_found` for a missing parent. */
    listSubnames: (
      name: string,
      params?: ListSubnamesParams,
      options?: RequestOptions,
    ): Promise<BignamePage<SubnameRow>> =>
      get(`${names(name)}/subnames`, params, options),

    /** `GET /v1/names/{name}/history`. Rejects `not_found` for a missing name. */
    getNameHistory: (
      name: string,
      params?: NameHistoryParams,
      options?: RequestOptions,
    ): Promise<BignamePage<HistoryEvent>> =>
      get(`${names(name)}/history`, params, options),

    /** `GET /v1/addresses/{address}/names`. */
    listAddressNames: (
      address: string,
      params?: ListAddressNamesParams,
      options?: RequestOptions,
    ): Promise<BignamePage<AddressNameRow>> =>
      get(`${addresses(address)}/names`, params, options),

    /** `GET /v1/addresses/{address}/primary-name`. Always 200 with in-band `status`. */
    getPrimaryName: (
      address: string,
      params?: GetPrimaryNameParams,
      options?: RequestOptions,
    ): Promise<BignameResponse<PrimaryName>> =>
      get(`${addresses(address)}/primary-name`, params, options),

    /** `GET /v1/addresses/{address}/history`. Rows may omit `name`. */
    getAddressHistory: (
      address: string,
      params?: AddressHistoryParams,
      options?: RequestOptions,
    ): Promise<BignamePage<EventRow>> =>
      get(`${addresses(address)}/history`, params, options),

    /**
     * `GET /v1/events`. `total_count` is null unless name/address/
     * registration_id/resolver anchors it, or `include: ['total_count']`.
     */
    listEvents: (
      params?: ListEventsParams,
      options?: RequestOptions,
    ): Promise<BignamePage<EventRow>> => {
      const query = params && {
        ...params,
        resolver:
          params.resolver === undefined
            ? undefined
            : formatContractFilter(params.resolver),
      }
      return get('/v1/events', query, options)
    },

    /**
     * `POST /v1/lookup`: batched forward/reverse lookup with in-band per-input
     * `status`. The result type follows `profile` (server default `detail`).
     */
    lookup: <TProfile extends LookupProfile = 'detail'>(
      body: LookupRequest<TProfile>,
      options?: RequestOptions,
    ): Promise<BignameResponse<readonly LookupResult<TProfile>[]>> =>
      request({
        method: 'POST',
        path: '/v1/lookup',
        body,
        signal: options?.signal,
        retryStale: true,
      }),

    /** `GET /v1/names`: namespace-wide expiry sweep. `total_count` is always null. */
    listNames: (
      params: ListNamesParams,
      options?: RequestOptions,
    ): Promise<BignamePage<NameListRow>> => get('/v1/names', params, options),

    /** `GET /v1/search`: prefix or contains match over names. */
    search: (
      params: SearchParams,
      options?: RequestOptions,
    ): Promise<BignamePage<NameListRow>> => get('/v1/search', params, options),

    /**
     * `GET /v1/permissions`. Reads bound to a name or registration carry
     * top-level `restrictions`; a `registry` read lists root holders.
     */
    listPermissions: (
      params: ListPermissionsParams,
      options?: RequestOptions,
    ): Promise<PermissionsPage> => {
      const query =
        params.registry === undefined
          ? params
          : { ...params, registry: formatContractFilter(params.registry) }
      return get('/v1/permissions', query, options)
    },

    /** `GET /v1/registries/{chain_id}/{address}`. `null` for an unknown registry (404). */
    getRegistry: (
      chainId: number,
      address: string,
      params?: GetRegistryParams,
      options?: RequestOptions,
    ): Promise<BignameResponse<Registry> | null> =>
      nullOnNotFound(get(registries(chainId, address), params, options)),

    /** `GET /v1/registries/{chain_id}/{address}/labels`. */
    listRegistryLabels: (
      chainId: number,
      address: string,
      params?: ListRegistryLabelsParams,
      options?: RequestOptions,
    ): Promise<BignamePage<RegistryLabelRow>> =>
      get(`${registries(chainId, address)}/labels`, params, options),

    /** `GET /v1/resolvers/{chain_id}/{address}`. `null` when there is no overview (404). */
    getResolver: (
      chainId: number,
      address: string,
      params?: ResolverParams,
      options?: RequestOptions,
    ): Promise<BignameResponse<ResolverOverview> | null> =>
      nullOnNotFound(
        getPinnedResolverRead(resolvers(chainId, address), params, options),
      ),

    /** `GET /v1/resolvers/{chain_id}/{address}/links` (ENSv2 record-ID resolvers). */
    listResolverLinks: (
      chainId: number,
      address: string,
      params?: ResolverParams,
      options?: RequestOptions,
    ): Promise<BignamePage<ResolverLinkRow>> =>
      getPinnedResolverRead(
        `${resolvers(chainId, address)}/links`,
        params,
        options,
      ),

    /** `GET /v1/resolvers/{chain_id}/{address}/roles`. */
    listResolverRoles: (
      chainId: number,
      address: string,
      params?: ResolverParams,
      options?: RequestOptions,
    ): Promise<BignamePage<ResolverRoleRow>> =>
      getPinnedResolverRead(
        `${resolvers(chainId, address)}/roles`,
        params,
        options,
      ),

    /** `GET /v1/namespaces/{namespace}`: capabilities and per-network resolution protocol. */
    getNamespace: (
      namespace: Namespace,
      options?: RequestOptions,
    ): Promise<BignameResponse<NamespaceInfo>> =>
      get(`/v1/namespaces/${pathSegment(namespace)}`, undefined, options),
  }
}

export type BignameClient = ReturnType<typeof createBignameClient>
