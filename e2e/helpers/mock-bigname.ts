/**
 * Mock bigname — serves the bigname REST API (`/v1`) from Playwright routes.
 *
 * The manager and portal read names, record inventories and history from
 * bigname (`@ens-apps/bigname`). The e2e suite registers names on a local
 * Anvil fork, which the public Sepolia deployment the apps call by default
 * (https://sepolia.api.bigname.sh) never indexes, so the mock answers for the
 * names a test registers and treats every other name as not indexed (404),
 * exactly as the real deployment does for a fork-only name.
 *
 * Browser requests only: server-side (SSR) reads bypass `page.route()` and
 * still reach the real deployment.
 *
 * Usage:
 *   const bigname = createBignameMock()
 *   await bigname.installIfEnabled(page)          // E2E_MOCK_BIGNAME=true
 *   bigname.addName({ name: 'foo.eth', owner })   // shared by every page
 *   await bigname.addPageNames(page, [v1MockName({ name, ownerAddress })])
 *
 * Response shapes follow `packages/bigname/src/types.ts` and the live
 * deployment. Requests carrying a query parameter the route does not accept
 * answer `400 invalid_input`, as bigname does.
 */
import {
  type AddressNameRow,
  type Authority,
  type AuthorityRelation,
  type BignamePage,
  type BignameResponse,
  type ContractRef,
  type ErrorEnvelope,
  type Grant,
  type Hex,
  type HistoryEvent,
  type LookupAddressInput,
  type LookupAddressRecord,
  type LookupNameInput,
  type LookupResult,
  MAX_PAGE_SIZE,
  type NameListRow,
  type NameProfile,
  type NameRecords,
  type Page as PageInfo,
  type PermissionRow,
  type PermissionsPage,
  type PrimaryName,
  parseRecordKey,
  type RecordAnswer,
  type RecordInventory,
  type RecordKey,
  type Restrictions,
  type RoleSummaryEntry,
  type Status,
  type SubnameRow,
  secondsToTimestamp,
  type WrapperFuses,
  type WrapperState,
} from '@ens-apps/bigname'
import { NETWORKS } from '@ens-apps/config'
import type { Page, Route } from '@playwright/test'
import { labelhash, namehash } from 'viem'
import type {
  V1AddressRecord,
  V1NameType,
  V1TextRecord,
} from '../fixtures/makeV1Name.js'

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

/** A name the mock serves. Field defaults describe a fresh ENSv2 `.eth` name. */
export type MockBignameName = {
  /** Normalized name, e.g. `foo-123.eth`. */
  name: string
  /** Token holder; also served as registrant and effective manager. */
  owner: string
  /** Default `ens_v2`. */
  authority?: Authority
  /** Full NameWrapper fuse word of a wrapped ENSv1 name; omit when unwrapped. */
  wrapperFuses?: number
  /** Unix seconds. Omitted: served without `expires_at` (no expiry). */
  expiresAt?: number
  /** Unix seconds. Omitted: apps fall back to their on-chain read. */
  registeredAt?: number
  /** Unix seconds. */
  createdAt?: number
  /** Unix seconds of a proven ENSv1→ENSv2 migration (`migrated_at`). */
  migratedAt?: number
  resolver?: string
  /** Text records; keys feed the record inventory the apps discover keys from. */
  records?: V1TextRecord[]
  addresses?: V1AddressRecord[]
  /** Whether the name is the owner's primary name (`is_primary`). */
  isPrimary?: boolean
}

// ---------------------------------------------------------------------------
// ENSv1 fixtures
// ---------------------------------------------------------------------------

/** NameWrapper fuse bits (ens-contracts `INameWrapper`). */
const FUSES = {
  CANNOT_UNWRAP: 1,
  CANNOT_BURN_FUSES: 2,
  CANNOT_TRANSFER: 4,
  CANNOT_SET_RESOLVER: 8,
  CANNOT_SET_TTL: 16,
  CANNOT_CREATE_SUBDOMAIN: 32,
  CANNOT_APPROVE: 64,
  PARENT_CANNOT_CONTROL: 1 << 16,
  IS_DOT_ETH: 1 << 17,
  CAN_EXTEND_EXPIRY: 1 << 18,
} as const

/** NameWrapper auto-sets these on every wrapped `.eth` 2LD. */
const DOT_ETH_2LD_FUSES = FUSES.PARENT_CANNOT_CONTROL | FUSES.IS_DOT_ETH

export type MockV1Name = {
  /** Full name including `.eth` (e.g. `migtest-123.eth`). */
  name: string
  /** EOA that owns this ENSv1 name. */
  ownerAddress: string
  /** Must match what was passed to `makeV1Name`. Default `unwrapped`. */
  type?: V1NameType
  /**
   * Owner-controlled fuses of a wrapped name. PARENT_CANNOT_CONTROL and
   * IS_DOT_ETH are ORed in, as the NameWrapper does for `.eth` 2LDs. Defaults
   * to CANNOT_UNWRAP for `locked` and none for `wrapped`.
   */
  fuses?: number
  /** Registrar lease expiry (unix seconds). Default: now + 1 year. */
  expiryDate?: number
  /** Resolver the name points at, when it has one. */
  resolver?: string
  /** Records set on the name; their keys become the record inventory. */
  records?: {
    texts?: V1TextRecord[]
    addresses?: V1AddressRecord[]
  }
}

/** The bigname view of an ENSv1 `.eth` 2LD registered with `makeV1Name`. */
export const v1MockName = (name: MockV1Name): MockBignameName => {
  const type = name.type ?? 'unwrapped'
  const ownerFuses = name.fuses ?? (type === 'locked' ? FUSES.CANNOT_UNWRAP : 0)
  return {
    name: name.name,
    owner: name.ownerAddress,
    authority: 'ens_v1',
    wrapperFuses:
      type === 'unwrapped' ? undefined : ownerFuses | DOT_ETH_2LD_FUSES,
    expiresAt:
      name.expiryDate ?? Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    resolver: name.resolver,
    records: name.records?.texts,
    addresses: name.records?.addresses,
  }
}

// ---------------------------------------------------------------------------
// Served shapes
// ---------------------------------------------------------------------------

const CHAIN_ID = 11155111
const NETWORK = 'ethereum-sepolia'
const DEFAULT_PAGE_SIZE = 50

type StoredName = MockBignameName & {
  readonly key: string
  readonly node: Hex
  readonly ownerLower: Hex
  readonly authorityValue: Authority
}

const toStored = (name: MockBignameName): StoredName => {
  const normalized = name.name.toLowerCase()
  return {
    ...name,
    name: normalized,
    key: normalized,
    node: namehash(normalized),
    ownerLower: name.owner.toLowerCase() as Hex,
    authorityValue: name.authority ?? 'ens_v2',
  }
}

const timestamp = (seconds: number | undefined) =>
  seconds === undefined ? undefined : secondsToTimestamp(seconds)

const parentOf = (name: string): string | null => {
  const dot = name.indexOf('.')
  return dot === -1 ? null : name.slice(dot + 1)
}

const isDotEth2ld = (name: string) => parentOf(name) === 'eth'

/** Deterministic stand-in for bigname's registration UUID. */
const registrationId = (name: StoredName) => {
  const hex = name.node.slice(2, 34)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

const contract = (address: string): ContractRef => ({
  chain_id: CHAIN_ID,
  address: address.toLowerCase() as Hex,
})

const wrapperFuses = (fuses: number): WrapperFuses => ({
  fuses,
  cannot_unwrap: (fuses & FUSES.CANNOT_UNWRAP) !== 0,
  cannot_burn_fuses: (fuses & FUSES.CANNOT_BURN_FUSES) !== 0,
  cannot_transfer: (fuses & FUSES.CANNOT_TRANSFER) !== 0,
  cannot_set_resolver: (fuses & FUSES.CANNOT_SET_RESOLVER) !== 0,
  cannot_set_ttl: (fuses & FUSES.CANNOT_SET_TTL) !== 0,
  cannot_create_subdomain: (fuses & FUSES.CANNOT_CREATE_SUBDOMAIN) !== 0,
  cannot_approve: (fuses & FUSES.CANNOT_APPROVE) !== 0,
  parent_cannot_control: (fuses & FUSES.PARENT_CANNOT_CONTROL) !== 0,
  is_dot_eth: (fuses & FUSES.IS_DOT_ETH) !== 0,
  can_extend_expiry: (fuses & FUSES.CAN_EXTEND_EXPIRY) !== 0,
})

const wrapperState = (fuses: number): WrapperState => {
  if (fuses & FUSES.CANNOT_UNWRAP) return 'locked'
  if (fuses & FUSES.PARENT_CANNOT_CONTROL) return 'emancipated'
  return 'wrapped'
}

/** Labels the live deployment serves: `active` (ENSv1), `wrapped`, `registered` (ENSv2). */
const registrationStatus = (name: StoredName) => {
  if (name.wrapperFuses !== undefined) return 'wrapped' as const
  return name.authorityValue === 'ens_v2'
    ? ('registered' as const)
    : ('active' as const)
}

const wrapperFields = (name: StoredName) =>
  name.wrapperFuses === undefined
    ? {}
    : {
        wrapper_state: wrapperState(name.wrapperFuses),
        wrapper_fuses: wrapperFuses(name.wrapperFuses),
      }

const inventoryKeys = (name: StoredName): RecordKey[] => [
  ...(name.records ?? []).map(({ key }): RecordKey => `text:${key}`),
  ...(name.addresses ?? []).map(
    ({ coinType }): RecordKey => `addr:${coinType}`,
  ),
]

const inventory = (name: StoredName): RecordInventory => ({
  known_keys: inventoryKeys(name),
  unset_keys: [],
  unsupported_keys: [],
  abi_content_types: [],
})

const listRow = (name: StoredName): NameListRow => ({
  name: name.name,
  display_name: name.name,
  namespace: 'ens',
  namehash: name.node,
  owner: name.ownerLower,
  registrant: name.ownerLower,
  registration_status: registrationStatus(name),
  registered_at: timestamp(name.registeredAt),
  created_at: timestamp(name.createdAt ?? name.registeredAt),
  expires_at: timestamp(name.expiresAt),
})

const profile = (name: StoredName): NameProfile => ({
  ...listRow(name),
  registration_id: registrationId(name),
  token_id: isDotEth2ld(name.name)
    ? BigInt(labelhash(name.name.split('.')[0])).toString()
    : undefined,
  ...wrapperFields(name),
  authority: name.authorityValue,
  migrated_at:
    name.authorityValue === 'ens_v2' ? timestamp(name.migratedAt) : undefined,
  resolver: name.resolver ? contract(name.resolver) : undefined,
  addresses: Object.fromEntries(
    (name.addresses ?? []).map(({ coinType, value }) => [
      String(coinType),
      value.toLowerCase() as Hex,
    ]),
  ),
  text_records: Object.fromEntries(
    (name.records ?? []).map(({ key, value }) => [key, value]),
  ),
  chain_id: CHAIN_ID,
  network: NETWORK,
  status: 'ok',
})

const ownerGrants = (name: StoredName): Grant[] =>
  name.authorityValue === 'ens_v2'
    ? [
        {
          grant_scope: { kind: 'registry', detail: {} },
          powers: [
            'set_subregistry',
            'set_resolver',
            'admin_set_subregistry',
            'admin_set_resolver',
            'can_transfer_admin',
          ],
        },
      ]
    : [
        {
          grant_scope: { kind: 'registration', detail: {} },
          powers: ['registration_control', 'set_resolver', 'transfer'],
        },
      ]

const roleSummary = (name: StoredName): RoleSummaryEntry[] => [
  { address: name.ownerLower, grants: ownerGrants(name) },
]

const restrictions = (name: StoredName): Restrictions | undefined => {
  if (name.authorityValue === 'ens_v2') {
    return {
      registration_id: registrationId(name),
      kind: 'ens_v2_registry',
      locked_roles: [],
    }
  }
  if (name.wrapperFuses === undefined) return undefined
  const graceSeconds = isDotEth2ld(name.name) ? 90 * 24 * 60 * 60 : 0
  return {
    registration_id: registrationId(name),
    kind: 'ens_v1_wrapper',
    ...wrapperFields(name),
    wrapper_expires_at: timestamp(
      name.expiresAt === undefined ? undefined : name.expiresAt + graceSeconds,
    ),
  }
}

/** Authority relations `address` holds on `name`, in the order bigname lists them. */
const relationsOf = (name: StoredName, address: string): AuthorityRelation[] =>
  name.ownerLower === address.toLowerCase()
    ? ['registrant', 'owner', 'manager']
    : []

// ---------------------------------------------------------------------------
// Request plumbing
// ---------------------------------------------------------------------------

class MockHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorEnvelope['error']['code'],
    message: string,
  ) {
    super(message)
  }
}

const notFound = (what: string) =>
  new MockHttpError(404, 'not_found', `${what} was not found in namespace ens`)

const invalid = (message: string) =>
  new MockHttpError(400, 'invalid_input', message)

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'accept, content-type',
}

const PAGE = ['cursor', 'page_size']
const SNAPSHOT = ['at', 'finality']
const HISTORY_FILTERS = [
  ...PAGE,
  'type',
  'order',
  'from_timestamp',
  'to_timestamp',
]

/** Query parameters each route accepts (api-v1-routes.md). */
const ALLOWED_PARAMS = {
  status: [],
  name: ['namespace', 'source', 'include', ...SNAPSHOT],
  records: ['namespace', 'source', 'keys', 'include', ...SNAPSHOT],
  subnames: [
    'namespace',
    'q',
    'sort',
    'order',
    'include_expired',
    'include',
    'finality',
    ...PAGE,
  ],
  nameHistory: ['namespace', 'scope', 'include', ...HISTORY_FILTERS],
  addressNames: [
    'namespace',
    'relation',
    'authority',
    'is_migrated',
    'coin_type',
    'q',
    'sort',
    'order',
    'dedupe',
    'include',
    'finality',
    ...PAGE,
  ],
  primaryName: ['coin_type', 'namespace', 'source'],
  addressHistory: [
    'namespace',
    'relation',
    'scope',
    'include',
    ...HISTORY_FILTERS,
  ],
  events: [
    'namespace',
    'name',
    'address',
    'resolver',
    'contract_address',
    'registration_id',
    'from_block',
    'to_block',
    'include',
    ...HISTORY_FILTERS,
  ],
  names: [
    'namespace',
    'sort',
    'order',
    'expires_after',
    'expires_before',
    ...PAGE,
  ],
  search: ['q', 'match', 'namespace', ...PAGE],
  permissions: [
    'name',
    'registration_id',
    'address',
    'namespace',
    'include',
    ...PAGE,
  ],
  registry: ['include', ...SNAPSHOT, ...PAGE],
  registryLabels: ['include', ...PAGE],
  resolver: [...SNAPSHOT, ...PAGE],
  namespace: [],
} satisfies Record<string, readonly string[]>

const assertParams = (
  params: URLSearchParams,
  route: keyof typeof ALLOWED_PARAMS,
) => {
  const allowed = new Set<string>(ALLOWED_PARAMS[route])
  for (const key of params.keys()) {
    if (!allowed.has(key)) {
      throw invalid(`unknown query parameter "${key}"`)
    }
  }
}

const listParam = (params: URLSearchParams, key: string): string[] =>
  (params.get(key) ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

const pageSizeOf = (params: URLSearchParams): number => {
  const raw = params.get('page_size')
  if (raw === null) return DEFAULT_PAGE_SIZE
  const size = Number(raw)
  if (!Number.isInteger(size) || size < 1 || size > MAX_PAGE_SIZE) {
    throw invalid(`page_size must be between 1 and ${MAX_PAGE_SIZE}`)
  }
  return size
}

const CURSOR_PREFIX = 'mock-offset:'

const offsetOf = (cursor: string | null): number => {
  if (cursor === null) return 0
  if (!cursor.startsWith(CURSOR_PREFIX)) throw invalid('malformed cursor')
  return Number(cursor.slice(CURSOR_PREFIX.length))
}

/** Offset pagination behind an opaque-looking cursor. */
const paginate = <TRow>(
  rows: readonly TRow[],
  params: URLSearchParams,
  totalCount: number | null,
): BignamePage<TRow> => {
  const pageSize = pageSizeOf(params)
  const cursor = params.get('cursor')
  const offset = offsetOf(cursor)
  const data = rows.slice(offset, offset + pageSize)
  const hasMore = offset + pageSize < rows.length
  const page: PageInfo = {
    cursor,
    next_cursor: hasMore ? `${CURSOR_PREFIX}${offset + pageSize}` : null,
    page_size: pageSize,
    total_count: totalCount,
    has_more: hasMore,
  }
  return { data, page, meta: {} }
}

const emptyPage = (
  params: URLSearchParams,
  totalCount: number | null = null,
): BignamePage<never> => paginate<never>([], params, totalCount)

const resource = <TData>(data: TData): BignameResponse<TData> => ({
  data,
  meta: {},
})

type SortKey = 'name' | 'expires_at' | 'registered_at'

const sortNames = (
  names: StoredName[],
  params: URLSearchParams,
  defaultSort: SortKey = 'name',
): StoredName[] => {
  const sort = (params.get('sort') ?? defaultSort) as SortKey
  const direction = params.get('order') === 'desc' ? -1 : 1
  const value = (name: StoredName): string | number | undefined =>
    sort === 'name'
      ? name.name
      : sort === 'expires_at'
        ? name.expiresAt
        : name.registeredAt
  return [...names].sort((a, b) => {
    const av = value(a)
    const bv = value(b)
    // Unknown values sort last in either direction.
    if (av === undefined && bv === undefined) return 0
    if (av === undefined) return 1
    if (bv === undefined) return -1
    if (av < bv) return -direction
    if (av > bv) return direction
    return 0
  })
}

const matchesPrefix = (name: StoredName, q: string | null) =>
  !q || name.name.startsWith(q.trim().toLowerCase())

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

type NameStore = ReadonlyMap<string, StoredName>

const findName = (store: NameStore, raw: string): StoredName => {
  const name = store.get(raw.toLowerCase())
  if (!name) throw notFound(`name ${raw}`)
  return name
}

const status = (): BignameResponse<Status> =>
  resource({
    status: 'ready',
    pending_invalidation_count: 0,
    pending_invalidation_count_capped: false,
    dead_letter_count: 0,
    chains: {
      [String(CHAIN_ID)]: {
        latest_block: null,
        indexed_block: null,
        safe_block: null,
        finalized_block: null,
        lag_blocks: null,
        lag_seconds: null,
        network_block: null,
        network_head_observed_at: null,
        network_head_age_seconds: null,
        network_head_status: null,
        ingestion_lag_blocks: null,
        ingestion_lag_seconds: null,
        status: 'ready',
      },
    },
  })

const childrenOf = (store: NameStore, parent: string) =>
  [...store.values()].filter((name) => parentOf(name.name) === parent)

const nameDetail = (
  store: NameStore,
  raw: string,
  params: URLSearchParams,
): BignameResponse<NameProfile> => {
  assertParams(params, 'name')
  const name = findName(store, raw)
  const counts = listParam(params, 'include').includes('counts')
  return resource({
    ...profile(name),
    ...(counts
      ? {
          subname_count: childrenOf(store, name.name).length,
          record_count: inventoryKeys(name).length,
        }
      : {}),
  })
}

const recordAnswer = (name: StoredName, key: string): RecordAnswer => {
  const parsed = parseRecordKey(key)
  const value =
    parsed?.kind === 'text' || parsed?.kind === 'avatar'
      ? name.records?.find(
          (record) =>
            record.key === (parsed.kind === 'text' ? parsed.key : 'avatar'),
        )?.value
      : parsed?.kind === 'addr'
        ? name.addresses
            ?.find((record) => record.coinType === parsed.coinType)
            ?.value.toLowerCase()
        : undefined
  return value === undefined ? { status: 'not_found' } : { status: 'ok', value }
}

const nameRecords = (
  store: NameStore,
  raw: string,
  params: URLSearchParams,
): BignameResponse<NameRecords> => {
  assertParams(params, 'records')
  const name = findName(store, raw)
  const keys = params.has('keys')
    ? listParam(params, 'keys')
    : inventoryKeys(name)
  return resource({
    namespace: 'ens',
    resolver: name.resolver ? contract(name.resolver) : null,
    records: Object.fromEntries(
      keys.map((key) => [key, recordAnswer(name, key)]),
    ),
    ...(listParam(params, 'include').includes('inventory')
      ? { inventory: inventory(name) }
      : {}),
  })
}

const subnames = (
  store: NameStore,
  raw: string,
  params: URLSearchParams,
): BignamePage<SubnameRow> => {
  assertParams(params, 'subnames')
  const parent = findName(store, raw)
  const children = sortNames(
    childrenOf(store, parent.name).filter((child) =>
      matchesPrefix(child, params.get('q')),
    ),
    params,
  )
  const rows = children.map(
    (child): SubnameRow => ({
      ...listRow(child),
      labelhash: labelhash(child.name.split('.')[0]),
      ...(listParam(params, 'include').includes('counts')
        ? { subname_count: childrenOf(store, child.name).length }
        : {}),
    }),
  )
  return paginate(rows, params, rows.length)
}

const historyTotal = (params: URLSearchParams) =>
  listParam(params, 'include').includes('total_count') ? 0 : null

/** Known names have no mocked history rows yet. */
const nameHistory = (
  store: NameStore,
  raw: string,
  params: URLSearchParams,
): BignamePage<HistoryEvent> => {
  assertParams(params, 'nameHistory')
  findName(store, raw)
  return emptyPage(params, historyTotal(params))
}

type RelationFilter =
  | { readonly kind: 'authority'; readonly relations: Set<AuthorityRelation> }
  | { readonly kind: 'resolves_to'; readonly coinType: number | 'evm' }

const AUTHORITY_RELATIONS: readonly AuthorityRelation[] = [
  'owner',
  'manager',
  'registrant',
]

const parseCoinType = (raw: string | null): number | 'evm' => {
  if (raw === null || raw.trim() === '') return 60
  if (raw.trim() === 'evm') return 'evm'
  const coinType = Number(raw)
  if (!Number.isInteger(coinType)) {
    throw invalid('coin_type must be a decimal coin type or evm')
  }
  return coinType
}

const parseAuthorityRelations = (
  values: readonly string[],
): Set<AuthorityRelation> => {
  const relations = new Set<AuthorityRelation>()
  for (const value of values) {
    const expanded =
      value === 'any'
        ? AUTHORITY_RELATIONS
        : AUTHORITY_RELATIONS.filter((relation) => relation === value)
    if (expanded.length === 0) throw invalid(`unknown relation "${value}"`)
    for (const relation of expanded) relations.add(relation)
  }
  return relations
}

const parseRelation = (
  raw: string | null,
  coinTypeParam: string | null,
): RelationFilter => {
  const values = (raw ?? 'any').split(',').map((value) => value.trim())
  if (!values.includes('resolves_to')) {
    if (coinTypeParam !== null) {
      throw invalid('coin_type is accepted only with relation=resolves_to')
    }
    return { kind: 'authority', relations: parseAuthorityRelations(values) }
  }
  if (values.length > 1) {
    throw invalid('resolves_to cannot be combined with other relations')
  }
  return { kind: 'resolves_to', coinType: parseCoinType(coinTypeParam) }
}

const isEvmCoinType = (coinType: number) =>
  coinType === 60 || (coinType >= 0x80000000 && coinType <= 0xffffffff)

type AddressNamesQuery = {
  readonly addressLower: string
  readonly relation: RelationFilter
  readonly authority: string | null
  readonly isMigrated: string | null
  readonly q: string | null
  readonly include: readonly string[]
}

const matchesAddressNamesFilters = (
  name: StoredName,
  query: AddressNamesQuery,
): boolean => {
  if (query.authority !== null && name.authorityValue !== query.authority) {
    return false
  }
  if (query.isMigrated !== null) {
    const migrated =
      name.authorityValue === 'ens_v2' && name.migratedAt !== undefined
    if (migrated !== (query.isMigrated === 'true')) return false
  }
  return matchesPrefix(name, query.q)
}

const addressNameBase = (
  store: NameStore,
  name: StoredName,
  query: AddressNamesQuery,
) => ({
  ...listRow(name),
  permission_resource_id: registrationId(name),
  authority: name.authorityValue,
  migrated_at:
    name.authorityValue === 'ens_v2' ? timestamp(name.migratedAt) : undefined,
  is_primary: name.isPrimary === true && name.ownerLower === query.addressLower,
  ...(query.include.includes('role_summary')
    ? { role_summary: roleSummary(name), restrictions: restrictions(name) }
    : {}),
  ...(query.include.includes('counts')
    ? {
        subname_count: childrenOf(store, name.name).length,
        record_count: inventoryKeys(name).length,
      }
    : {}),
})

/** The relation-specific part of a row, or null when the name does not match. */
const relationFields = (
  name: StoredName,
  query: AddressNamesQuery,
): Pick<AddressNameRow, 'relations' | 'resolution' | 'resolutions'> | null => {
  const { relation, addressLower } = query
  if (relation.kind === 'authority') {
    const relations = relationsOf(name, addressLower).filter((value) =>
      relation.relations.has(value),
    )
    return relations.length > 0 ? { relations } : null
  }
  const resolutions = (name.addresses ?? [])
    .filter(
      (record) =>
        record.value.toLowerCase() === addressLower &&
        (relation.coinType === 'evm'
          ? isEvmCoinType(record.coinType)
          : record.coinType === relation.coinType),
    )
    .map((record) => ({
      coin_type: record.coinType,
      record_key: `addr:${record.coinType}`,
    }))
  if (resolutions.length === 0) return null
  return relation.coinType === 'evm'
    ? { relations: ['resolves_to'], resolutions }
    : { relations: ['resolves_to'], resolution: resolutions[0] }
}

const addressNames = (
  store: NameStore,
  address: string,
  params: URLSearchParams,
): BignamePage<AddressNameRow> => {
  assertParams(params, 'addressNames')
  const query: AddressNamesQuery = {
    addressLower: address.toLowerCase(),
    relation: parseRelation(params.get('relation'), params.get('coin_type')),
    authority: params.get('authority'),
    isMigrated: params.get('is_migrated'),
    q: params.get('q'),
    include: listParam(params, 'include'),
  }
  if (query.relation.kind === 'resolves_to' && query.isMigrated !== null) {
    throw invalid('is_migrated is rejected with relation=resolves_to')
  }

  const rows = sortNames([...store.values()], params).flatMap(
    (name): AddressNameRow[] => {
      if (!matchesAddressNamesFilters(name, query)) return []
      const fields = relationFields(name, query)
      return fields
        ? [{ ...addressNameBase(store, name, query), ...fields }]
        : []
    },
  )

  // Exact for authority relations (as bigname), null for `resolves_to`.
  return paginate(
    rows,
    params,
    query.relation.kind === 'authority' ? rows.length : null,
  )
}

const primaryName = (
  store: NameStore,
  address: string,
  params: URLSearchParams,
): BignameResponse<PrimaryName> => {
  assertParams(params, 'primaryName')
  const addressLower = address.toLowerCase() as Hex
  const primary = [...store.values()].find(
    (name) => name.isPrimary && name.ownerLower === addressLower,
  )
  const answer = primary
    ? { status: 'ok' as const, name: primary.name }
    : { status: 'not_found' as const }
  return resource({
    address: addressLower,
    coin_type: Number(params.get('coin_type') ?? 60),
    namespace: 'ens',
    answers: [{ source: 'indexed', ...answer }],
    verification: answer,
  })
}

const listNames = (
  store: NameStore,
  params: URLSearchParams,
): BignamePage<NameListRow> => {
  assertParams(params, 'names')
  const after = params.get('expires_after')
  const before = params.get('expires_before')
  if (!after && !before) {
    throw invalid('expires_after or expires_before is required')
  }
  const afterSeconds = after ? Date.parse(after) / 1000 : -Infinity
  const beforeSeconds = before ? Date.parse(before) / 1000 : Infinity
  const rows = sortNames(
    [...store.values()].filter(
      (name) =>
        name.expiresAt !== undefined &&
        name.expiresAt >= afterSeconds &&
        name.expiresAt < beforeSeconds,
    ),
    params,
    'expires_at',
  ).map(listRow)
  return paginate(rows, params, null)
}

const search = (
  store: NameStore,
  params: URLSearchParams,
): BignamePage<NameListRow> => {
  assertParams(params, 'search')
  const q = (params.get('q') ?? '').trim().toLowerCase()
  if (!q) throw invalid('q is required')
  const contains = params.get('match') === 'contains'
  const rows = sortNames(
    [...store.values()].filter((name) =>
      contains ? name.name.includes(q) : name.name.startsWith(q),
    ),
    params,
  ).map(listRow)
  return paginate(rows, params, null)
}

const permissions = (
  store: NameStore,
  params: URLSearchParams,
): PermissionsPage => {
  assertParams(params, 'permissions')
  const nameParam = params.get('name')
  const registrationParam = params.get('registration_id')
  const address = params.get('address')?.toLowerCase()
  if (!nameParam && !registrationParam && !address) {
    throw invalid('one of name, registration_id or address is required')
  }
  const bound = nameParam
    ? findName(store, nameParam)
    : registrationParam
      ? [...store.values()].find(
          (name) => registrationId(name) === registrationParam,
        )
      : undefined
  if (registrationParam && !bound) return emptyPage(params)
  const candidates = bound ? [bound] : [...store.values()]
  const rows = candidates.flatMap((name): PermissionRow[] =>
    roleSummary(name)
      .filter((entry) => !address || entry.address === address)
      .flatMap((entry) =>
        entry.grants.map((grant) => ({
          address: entry.address,
          ...grant,
          registration_id: registrationId(name),
          name: name.name,
          authority_context: 'current_for_name',
          ...wrapperFields(name),
        })),
      ),
  )
  const restriction = bound ? restrictions(bound) : undefined
  return {
    ...paginate(rows, params, null),
    ...(restriction ? { restrictions: restriction } : {}),
  }
}

type LookupBody = {
  inputs?: unknown
  profile?: unknown
  namespace?: unknown
  include?: unknown
}

/** A reverse lookup input: the address's authority-relation names, one page. */
const lookupAddress = (
  store: NameStore,
  input: LookupAddressInput,
): LookupResult => {
  const addressLower = input.address.toLowerCase()
  const relation = parseRelation(input.relation ?? null, null)
  const records = [...store.values()].flatMap((name): LookupAddressRecord[] => {
    if (relation.kind !== 'authority') return []
    const relations = relationsOf(name, addressLower).filter((value) =>
      relation.relations.has(value),
    )
    if (relations.length === 0) return []
    const isPrimary =
      name.isPrimary === true && name.ownerLower === addressLower
    return [{ ...profile(name), is_primary: isPrimary, relations }]
  })
  const params = new URLSearchParams()
  if (input.page_size !== undefined) {
    params.set('page_size', String(input.page_size))
  }
  if (input.cursor) params.set('cursor', input.cursor)
  const { data, page } = paginate(records, params, null)
  return { kind: 'address', input, status: 'ok', records: data, page }
}

const lookup = (
  store: NameStore,
  rawBody: string | null,
): BignameResponse<LookupResult[]> => {
  let body: LookupBody
  try {
    body = JSON.parse(rawBody ?? '') as LookupBody
  } catch {
    throw invalid('request body must be JSON')
  }
  if (body.profile !== 'feed' && body.profile !== 'detail') {
    throw invalid('profile must be feed or detail')
  }
  const include =
    typeof body.include === 'string'
      ? body.include.split(',').map((value) => value.trim())
      : []
  if (include.some((value) => value !== 'inventory')) {
    throw invalid('include allows inventory only')
  }
  if (include.length > 0 && body.profile !== 'detail') {
    throw invalid('include requires profile=detail')
  }
  if (!Array.isArray(body.inputs) || body.inputs.length > 1000) {
    throw invalid('inputs must be an array of at most 1000 entries')
  }
  const withInventory = include.includes('inventory')
  const detail = body.profile === 'detail'

  const record = (name: StoredName) => {
    const full = profile(name)
    if (detail) {
      return withInventory ? { ...full, inventory: inventory(name) } : full
    }
    // `feed` is the field-budgeted subset: no flat record maps.
    return { ...full, addresses: undefined, text_records: undefined }
  }

  const inputs = body.inputs as (LookupNameInput | LookupAddressInput)[]
  const results = inputs.map((input): LookupResult => {
    if ('name' in input && typeof input.name === 'string') {
      const name = store.get(input.name.toLowerCase())
      return name
        ? { kind: 'name', input, status: 'ok', record: record(name) }
        : { kind: 'name', input, status: 'not_found' }
    }
    if ('address' in input && typeof input.address === 'string') {
      return lookupAddress(store, input)
    }
    throw invalid('each input needs a name or an address')
  })
  return resource(results)
}

const namespaceInfo = (namespace: string) =>
  resource({
    namespace,
    capabilities: {},
    networks: [{ network: NETWORK, chain_id: CHAIN_ID }],
  })

type RouteArgs = {
  readonly store: NameStore
  /** Path segments after the route head, decoded. */
  readonly rest: readonly string[]
  readonly params: URLSearchParams
}

/** `undefined` means the path is not a route. */
type RouteHandler = (args: RouteArgs) => unknown

const namesRoute: RouteHandler = ({ store, rest, params }) => {
  if (rest.length === 0) return listNames(store, params)
  const [name, sub, ...extra] = rest
  if (extra.length > 0) return undefined
  switch (sub) {
    case undefined:
      return nameDetail(store, name, params)
    case 'records':
      return nameRecords(store, name, params)
    case 'subnames':
      return subnames(store, name, params)
    case 'history':
      return nameHistory(store, name, params)
    default:
      return undefined
  }
}

const addressesRoute: RouteHandler = ({ store, rest, params }) => {
  const [address, sub, ...extra] = rest
  if (!address || extra.length > 0) return undefined
  switch (sub) {
    case 'names':
      return addressNames(store, address, params)
    case 'primary-name':
      return primaryName(store, address, params)
    case 'history':
      assertParams(params, 'addressHistory')
      return emptyPage(params, historyTotal(params))
    default:
      return undefined
  }
}

/** No registries are mocked: detail is 404 (the client reads null), labels empty. */
const registriesRoute: RouteHandler = ({ rest, params }) => {
  if (rest.length === 2) {
    assertParams(params, 'registry')
    throw notFound(`registry ${rest.join(':')}`)
  }
  if (rest.length === 3 && rest[2] === 'labels') {
    assertParams(params, 'registryLabels')
    return emptyPage(params, 0)
  }
  return undefined
}

/** No resolver overviews are mocked: detail is 404, collections empty. */
const resolversRoute: RouteHandler = ({ rest, params }) => {
  if (rest.length === 2) {
    assertParams(params, 'resolver')
    throw notFound(`resolver ${rest.join(':')}`)
  }
  if (rest.length === 3 && ['links', 'roles', 'aliases'].includes(rest[2])) {
    assertParams(params, 'resolver')
    return emptyPage(params, 0)
  }
  return undefined
}

const GET_ROUTES: Record<string, RouteHandler> = {
  status: ({ rest, params }) => {
    if (rest.length > 0) return undefined
    assertParams(params, 'status')
    return status()
  },
  names: namesRoute,
  addresses: addressesRoute,
  events: ({ rest, params }) => {
    if (rest.length > 0) return undefined
    assertParams(params, 'events')
    return emptyPage(params, historyTotal(params))
  },
  search: ({ store, rest, params }) =>
    rest.length > 0 ? undefined : search(store, params),
  permissions: ({ store, rest, params }) =>
    rest.length > 0 ? undefined : permissions(store, params),
  registries: registriesRoute,
  resolvers: resolversRoute,
  namespaces: ({ rest, params }) => {
    if (rest.length !== 1) return undefined
    assertParams(params, 'namespace')
    return namespaceInfo(rest[0])
  },
}

/** Route one `/v1/...` request (path already stripped of any base-URL prefix). */
const dispatch = (
  store: NameStore,
  method: string,
  path: string,
  params: URLSearchParams,
  body: string | null,
): unknown => {
  const [head = '', ...rest] = path
    .replace(/^\/v1\/?/, '')
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent)

  if (method === 'POST' && head === 'lookup' && rest.length === 0) {
    return lookup(store, body)
  }
  const handler =
    method === 'GET' && Object.hasOwn(GET_ROUTES, head)
      ? GET_ROUTES[head]
      : undefined
  const result = handler?.({ store, rest, params })
  if (result === undefined) {
    throw new MockHttpError(
      404,
      'not_found',
      `no mocked route for ${method} ${path}`,
    )
  }
  return result
}

// ---------------------------------------------------------------------------
// Base URLs
// ---------------------------------------------------------------------------

type BaseUrl = { readonly origin: string; readonly pathPrefix: string }

/** The public deployments in the network profiles; mainnet has none yet. */
const PUBLIC_BIGNAME_URLS = Object.values(NETWORKS).map(
  (network) => network.endpoints.bignameApi,
)

/**
 * Where the apps send bigname requests: their network's public deployment (CI
 * leaves `VITE_BIGNAME_API_URL` unset, so Sepolia's), plus
 * `VITE_BIGNAME_API_URL` when the e2e env sets it for a custom deployment.
 */
const bignameBaseUrls = (): BaseUrl[] =>
  [...PUBLIC_BIGNAME_URLS, process.env.VITE_BIGNAME_API_URL]
    .filter((value): value is string => !!value?.trim())
    .map((value) => {
      const url = new URL(value.trim())
      return {
        origin: url.origin,
        pathPrefix: url.pathname.replace(/\/+$/, ''),
      }
    })

/** The `/v1/...` path of a bigname request, or null for any other URL. */
const bignamePath = (url: URL, baseUrls: readonly BaseUrl[]): string | null => {
  for (const { origin, pathPrefix } of baseUrls) {
    if (url.origin !== origin) continue
    const path = url.pathname.slice(pathPrefix.length)
    if (url.pathname.startsWith(pathPrefix) && path.startsWith('/v1/')) {
      return path
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBignameMock() {
  /** Names every page sees (e.g. ENSv2 names registered during the run). */
  const shared = new Map<string, StoredName>()
  /** Names one page sees on top of `shared` (e.g. a test's ENSv1 fixtures). */
  const perPage = new WeakMap<Page, Map<string, StoredName>>()
  const installed = new WeakSet<Page>()
  const baseUrls = bignameBaseUrls()

  function addName(name: MockBignameName) {
    const stored = toStored(name)
    shared.set(stored.key, stored)
  }

  function storeFor(page: Page): NameStore {
    return new Map([...shared, ...(perPage.get(page) ?? [])])
  }

  async function handle(page: Page, route: Route) {
    const request = route.request()
    const url = new URL(request.url())
    const path = bignamePath(url, baseUrls)
    if (path === null) {
      await route.fallback()
      return
    }
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS })
      return
    }
    try {
      const json = dispatch(
        storeFor(page),
        request.method(),
        path,
        url.searchParams,
        request.postData(),
      )
      await route.fulfill({ status: 200, json, headers: CORS_HEADERS })
    } catch (error) {
      if (error instanceof MockHttpError) {
        if (error.status !== 404) {
          console.warn(
            `[mock-bigname] ${error.status} ${request.method()} ${path}${url.search}: ${error.message}`,
          )
        }
        const envelope: ErrorEnvelope = {
          error: { code: error.code, message: error.message, details: {} },
        }
        await route.fulfill({
          status: error.status,
          json: envelope,
          headers: CORS_HEADERS,
        })
        return
      }
      console.error('[mock-bigname] error handling request:', error)
      const envelope: ErrorEnvelope = {
        error: { code: 'internal_error', message: String(error) },
      }
      await route.fulfill({
        status: 500,
        json: envelope,
        headers: CORS_HEADERS,
      })
    }
  }

  async function install(page: Page) {
    if (installed.has(page)) return
    installed.add(page)
    await page.route(
      (url) => bignamePath(url, baseUrls) !== null,
      (route) => handle(page, route),
    )
  }

  /**
   * Serve `names` on `page` only, installing the mock there even when
   * E2E_MOCK_BIGNAME is off: fork-only names are invisible to any real
   * deployment.
   */
  async function addPageNames(page: Page, names: readonly MockBignameName[]) {
    await install(page)
    const store = perPage.get(page) ?? new Map<string, StoredName>()
    for (const name of names) {
      const stored = toStored(name)
      store.set(stored.key, stored)
    }
    perPage.set(page, store)
  }

  /** Whether the mock should be active on every page (E2E_MOCK_BIGNAME=true). */
  const enabled = process.env.E2E_MOCK_BIGNAME === 'true'

  /** Install only when the flag is on; no-op otherwise. */
  async function installIfEnabled(page: Page) {
    if (!enabled) return
    await install(page)
  }

  return { install, installIfEnabled, addName, addPageNames, enabled }
}
