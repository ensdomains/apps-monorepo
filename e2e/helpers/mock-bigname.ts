/**
 * Mock bigname — serves the bigname v0.4.1 REST API (`/v1`) from Playwright
 * routes.
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
 * Every response is typed against the v0.4.1 wire types in
 * `@ens-apps/bigname`, so contract drift fails typecheck, and follows what
 * live Sepolia serves (`packages/bigname/src/v041.mock.ts`):
 * - timestamps are decimal strings of Unix seconds;
 * - `owner` is the token holder and `manager` the account that can change the
 *   registry record; released names carry neither, only
 *   `lapsed_registration`; `relations` use `owner`, `manager`, `role_holder`,
 *   `resolves_to` and `former_owner` (`registrant` answers 400);
 * - ENSv1 rows carry `ens_v1` (lease date, wrapper state and fuses) and no
 *   top-level wrapper fields; name detail and lookup detail carry grouped
 *   `records`.
 * Requests carrying a query parameter the route does not accept answer
 * `400 invalid_input`, as bigname does. `meta` is served empty: the mock has
 * no chain position to report as `meta.as_of`, which the contract makes
 * optional.
 */
import {
  type AddressNameRow,
  type AddressRelation,
  type Authority,
  type AuthorityRelation,
  type BignamePage,
  type BignameResponse,
  type ContractRef,
  type EnsV1,
  type ErrorEnvelope,
  type EventRow,
  type ExpiryFields,
  type Grant,
  type Hex,
  type HistoryEvent,
  type HistoryEventKind,
  type HistoryEventType,
  isEvmCoinType,
  type LapsedRegistration,
  type LookupAddressRecord,
  type LookupFeedRecord,
  type LookupProfile,
  type LookupProfileRecord,
  type LookupResult,
  type LookupResultInput,
  MAX_PAGE_SIZE,
  type MigrationPath,
  type NameListRow,
  type NameProfile,
  type NameProfileFields,
  type NameRecords,
  type NameRowFields,
  type NamespaceInfo,
  type OwnershipFields,
  type Page as PageInfo,
  type PermissionRow,
  type PermissionsPage,
  type PrimaryName,
  parseRecordKey,
  type RecordAnswer,
  type RecordGroups,
  type RecordInventory,
  type RecordKey,
  type RegistrationStatus,
  type Resolution,
  type ResolverFields,
  type Restrictions,
  type RoleSummaryEntry,
  type Status,
  type SubnameRow,
  secondsToTimestamp,
  type Timestamp,
  type WrapperFuses,
  type WrapperState,
} from '@ens-apps/bigname'
import { NETWORKS } from '@ens-apps/config'
import type { Page, Route } from '@playwright/test'
import { keccak256, labelhash, namehash, toHex } from 'viem'
import type {
  V1AddressRecord,
  V1NameType,
  V1TextRecord,
} from '../fixtures/makeV1Name.js'

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

/** A proven ENSv1→ENSv2 migration: `migrated_at` and the `migration` history row. */
type MockMigration = {
  /** Unix seconds of the `MigrationApplied` block (`migrated_at`). */
  readonly at: number
  readonly path: MigrationPath
  /** Chain position of the `MigrationApplied` log; the apps drop history rows without one. */
  readonly blockNumber: number
  readonly transactionHash: Hex
  /** Default 0. */
  readonly logIndex?: number
  /** Contract that emitted `MigrationApplied` (the ENSv2 `eth` registry). */
  readonly contract: string
}

/** A name the mock serves. Field defaults describe a fresh ENSv2 `.eth` name. */
export type MockBignameName = {
  /** Normalized name, e.g. `foo-123.eth`. */
  name: string
  /**
   * Token holder, served as `owner`: the BaseRegistrar holder of an unwrapped
   * ENSv1 `.eth` 2LD, the NameWrapper holder of a wrapped name, the ENSv2
   * token holder. On a released name, its last holder
   * (`lapsed_registration.owner`, `relation=former_owner`).
   */
  owner: string
  /**
   * Registry owner of an unwrapped ENSv1 name when it differs from `owner`
   * (a `.eth` token transferred without `reclaim`). Default `owner`. Wrapped
   * and ENSv2 names serve their token holder as `manager`.
   */
  manager?: string
  /** Default `ens_v2`. */
  authority?: Authority
  /** Full NameWrapper fuse word of a wrapped ENSv1 name; omit when unwrapped. */
  wrapperFuses?: number
  /**
   * Unix seconds. For an ENSv1 `.eth` 2LD, the BaseRegistrar lease
   * (`ens_v1.expires_at`); the top-level expiry is derived from it (see
   * `expiryFields`). For an ENSv2 name or a wrapped ENSv1 subname, its
   * registry or NameWrapper expiry. Omitted: no expiry fields are served.
   */
  expiresAt?: number
  /** Unix seconds. Omitted: apps fall back to their on-chain read. */
  registeredAt?: number
  /**
   * Unix seconds of bigname's first observation. Default `registeredAt`, else
   * when the name was added to the mock: every name row carries `created_at`
   * (the apps read a row without it as a registry child with no name row).
   */
  createdAt?: number
  /**
   * Unix seconds bigname recorded the registration's release. Set it to
   * serve the name as `released` (no `owner`/`manager`,
   * `lapsed_registration`); the mock never releases a name on its own.
   */
  releasedAt?: number
  /**
   * Default `expired`. `unregistered` is an explicit ENSv2 unregister, which
   * serves `expires_at: null` with reason `released`.
   */
  releaseKind?: 'expired' | 'unregistered'
  /** ENSv2 names only. */
  migration?: MockMigration
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

const DAY_SECONDS = 24 * 60 * 60

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
  /**
   * BaseRegistrar lease expiry (unix seconds), served as `ens_v1.expires_at`.
   * Default: now + 1 year.
   */
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
      name.expiryDate ?? Math.floor(Date.now() / 1000) + 365 * DAY_SECONDS,
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
/** Sepolia's Universal Resolver cutover, as live `/v1/namespaces/ens` dates it. */
const SEPOLIA_RESOLUTION_SINCE_BLOCK = 11821680

/** ENSv1 BaseRegistrar grace after a lease expires. */
const ENS_V1_GRACE_SECONDS = 90 * DAY_SECONDS
/** ENSv2 `.eth` registrar grace. */
const ENS_V2_GRACE_SECONDS = 28 * DAY_SECONDS
/**
 * Premigration reserves a live ENSv1 lease in ENSv2 until the lease plus 62
 * days (the 90-day ENSv1 grace less the 28-day ENSv2 grace), so both renewal
 * deadlines fall on the same second.
 */
const RESERVATION_BONUS_SECONDS = ENS_V1_GRACE_SECONDS - ENS_V2_GRACE_SECONDS

/** Served on a released ENSv1 name, which no live ENSv2 entry resolves past the cutover. */
const NO_LIVE_ENS_V2_ENTRY = 'no_live_ens_v2_entry'

const AUTHORITIES: readonly Authority[] = ['ens_v0', 'ens_v1', 'ens_v2']

type StoredName = MockBignameName & {
  readonly key: string
  readonly node: Hex
  readonly ownerLower: Hex
  readonly managerLower: Hex
  readonly createdAtValue: number
  readonly authorityValue: Authority
  /** `ens_v1` or `ens_v0`: rows carry the `ens_v1` object. */
  readonly isEnsV1: boolean
  readonly isDotEth2ld: boolean
  readonly isReleased: boolean
  readonly isWrapped: boolean
}

const parentOf = (name: string): string | null => {
  const dot = name.indexOf('.')
  return dot === -1 ? null : name.slice(dot + 1)
}

const toStored = (name: MockBignameName): StoredName => {
  const normalized = name.name.toLowerCase()
  const authorityValue = name.authority ?? 'ens_v2'
  const isEnsV1 = authorityValue !== 'ens_v2'
  return {
    ...name,
    name: normalized,
    key: normalized,
    node: namehash(normalized),
    ownerLower: name.owner.toLowerCase() as Hex,
    managerLower: (name.manager ?? name.owner).toLowerCase() as Hex,
    createdAtValue:
      name.createdAt ?? name.registeredAt ?? Math.floor(Date.now() / 1000),
    authorityValue,
    isEnsV1,
    isDotEth2ld: parentOf(normalized) === 'eth',
    isReleased: name.releasedAt !== undefined,
    isWrapped: isEnsV1 && name.wrapperFuses !== undefined,
  }
}

const timestamp = (seconds: number | undefined): Timestamp | undefined =>
  seconds === undefined ? undefined : secondsToTimestamp(seconds)

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

/** Wrapper state and fuses of a live wrapped ENSv1 name (`ens_v1.*`, permission rows). */
const wrapperFields = (
  name: StoredName,
): { wrapper_state: WrapperState; wrapper_fuses: WrapperFuses } | undefined =>
  name.isWrapped && !name.isReleased && name.wrapperFuses !== undefined
    ? {
        wrapper_state: wrapperState(name.wrapperFuses),
        wrapper_fuses: wrapperFuses(name.wrapperFuses),
      }
    : undefined

/**
 * Labels live Sepolia serves: `active` (unwrapped ENSv1 lease), `wrapped`,
 * `registered` (ENSv2), `released`, and `unregistered` for an unwrapped ENSv1
 * subname, which holds no registration.
 */
const registrationStatus = (name: StoredName): RegistrationStatus => {
  if (name.isReleased) return 'released'
  if (name.isWrapped) return 'wrapped'
  if (!name.isEnsV1) return 'registered'
  return name.isDotEth2ld ? 'active' : 'unregistered'
}

/** A wrapped `.eth` 2LD whose ENSv1 lease has expired but not been released. */
const isWrappedLeaseInGrace = (name: StoredName, now: number): boolean =>
  name.isWrapped &&
  name.isDotEth2ld &&
  !name.isReleased &&
  name.expiresAt !== undefined &&
  name.expiresAt <= now

/**
 * `owner` is the token holder; `manager` the registry owner of an unwrapped
 * ENSv1 name and the token holder of a wrapped or ENSv2 one, omitted while a
 * wrapped `.eth` 2LD is in its registrar grace. A released name serves
 * neither (api-v1.md, Lapsed registration).
 */
const ownership = (name: StoredName, now: number): OwnershipFields => {
  if (name.isReleased) return {}
  const owner = name.ownerLower
  if (name.isWrapped) {
    return isWrappedLeaseInGrace(name, now)
      ? { owner }
      : { owner, manager: owner }
  }
  return { owner, manager: name.isEnsV1 ? name.managerLower : owner }
}

const finiteExpiry = (expiresAt: number, graceEndsAt: number) => ({
  expires_at: secondsToTimestamp(expiresAt),
  grace_ends_at: secondsToTimestamp(graceEndsAt),
})

/** `ens_v1`: present exactly while the name's `authority` is `ens_v1` or `ens_v0`. */
const ensV1 = (name: StoredName): EnsV1 => ({
  // Only a `.eth` 2LD holds a BaseRegistrar lease; every subname serves null.
  ...(name.isDotEth2ld
    ? name.expiresAt === undefined
      ? {}
      : { expires_at: secondsToTimestamp(name.expiresAt) }
    : { expires_at: null }),
  ...wrapperFields(name),
})

/**
 * Expiry fields (api-v1.md, Expiry and grace).
 *
 * The Anvil fork is Sepolia past the Universal Resolver cutover (live
 * `/v1/namespaces/ens` serves `resolution.protocol: "ens_v2"`), so a live
 * ENSv1 `.eth` 2LD serves its ENSv2 reservation's expiry at the top level and
 * keeps the BaseRegistrar lease as `ens_v1.expires_at`. The mock serves what
 * live Sepolia serves for every premigration reservation: `expires_at` =
 * lease + 62 days and `grace_ends_at` = `expires_at` + 28 days, so the lease
 * and the reservation stop being renewable on the same second (lease + 90
 * days). The apps read the lease from `ens_v1.expires_at`. `makeV1Name`'s
 * `reserveInV2` reserves fork names at the lease itself, without the 62-day
 * bonus, so a bigname indexing the fork would serve the lease at the top
 * level; the mock follows live Sepolia instead.
 *
 * A released lease has no live ENSv2 entry, so it serves the lease and its
 * 90-day ENSv1 grace (live `🚀🚀🚀.eth`). An ENSv2 `.eth` 2LD adds the 28-day
 * registrar grace; a subname has none (`grace_ends_at` = `expires_at`).
 */
const expiryFields = (name: StoredName): ExpiryFields => {
  if (!name.isEnsV1) {
    if (name.isReleased && name.releaseKind === 'unregistered') {
      return {
        expires_at: null,
        expires_at_reason: 'released',
        grace_ends_at: null,
      }
    }
    if (name.expiresAt === undefined) return {}
    const grace = name.isDotEth2ld ? ENS_V2_GRACE_SECONDS : 0
    return finiteExpiry(name.expiresAt, name.expiresAt + grace)
  }
  const ens_v1 = ensV1(name)
  const lease = name.expiresAt
  if (name.isDotEth2ld) {
    if (lease === undefined) return { ens_v1 }
    if (name.isReleased) {
      return { ...finiteExpiry(lease, lease + ENS_V1_GRACE_SECONDS), ens_v1 }
    }
    const reservation = lease + RESERVATION_BONUS_SECONDS
    return {
      ...finiteExpiry(reservation, reservation + ENS_V2_GRACE_SECONDS),
      ens_v1,
    }
  }
  // A wrapped subname's only expiry is its NameWrapper entry's; an unwrapped
  // subname has no registration context.
  if (!name.isWrapped) return { ens_v1 }
  return lease === undefined
    ? {
        expires_at: null,
        expires_at_reason: 'not_set',
        grace_ends_at: null,
        ens_v1,
      }
    : { ...finiteExpiry(lease, lease), ens_v1 }
}

/** The served top-level `expires_at` in seconds, for sorting and windows. */
const servedExpirySeconds = (name: StoredName): number | undefined => {
  const served = expiryFields(name).expires_at
  return served == null ? undefined : Number(served)
}

const lapsedRegistration = (
  name: StoredName,
): LapsedRegistration | undefined =>
  name.isReleased
    ? {
        owner: name.ownerLower,
        held_through: !name.isEnsV1
          ? 'registry'
          : name.isWrapped
            ? 'wrapper'
            : 'registrar',
        released_at: timestamp(name.releasedAt),
        release_kind: name.releaseKind ?? 'expired',
      }
    : undefined

/** Fields every list row of a name carries. */
const nameRowFields = (name: StoredName, now: number): NameRowFields => ({
  name: name.name,
  display_name: name.name,
  namespace: 'ens',
  namehash: name.node,
  ...ownership(name, now),
  registration_status: registrationStatus(name),
  registered_at: timestamp(name.registeredAt),
  created_at: secondsToTimestamp(name.createdAtValue),
  ...expiryFields(name),
  authority: name.authorityValue,
})

const listRow = (name: StoredName, now: number): NameListRow => ({
  ...nameRowFields(name, now),
  lapsed_registration: lapsedRegistration(name),
})

const migratedAt = (name: StoredName): Timestamp | undefined =>
  name.isEnsV1 ? undefined : timestamp(name.migration?.at)

const sortedAddresses = (name: StoredName) =>
  [...(name.addresses ?? [])].sort((a, b) => a.coinType - b.coinType)

const sortedTexts = (name: StoredName) =>
  [...(name.records ?? [])].sort((a, b) => (a.key < b.key ? -1 : 1))

/** Grouped records: every key the mock knows has an authoritative value. */
const recordGroups = (name: StoredName): RecordGroups => ({
  seen_addresses: sortedAddresses(name).map(({ coinType }) => String(coinType)),
  addresses: Object.fromEntries(
    sortedAddresses(name).map(({ coinType, value }) => [
      String(coinType),
      value.toLowerCase() as Hex,
    ]),
  ),
  seen_texts: sortedTexts(name).map(({ key }) => key),
  texts: Object.fromEntries(
    sortedTexts(name).map(({ key, value }) => [key, value]),
  ),
  seen_abis: [],
  abis: {},
  seen_singletons: [],
  contenthash: null,
  name: null,
})

/**
 * A released name has no serving inventory. A released ENSv1 name also
 * resolves to nothing past the cutover, so it serves `unresolvable_reason`
 * when it records a resolver.
 */
const resolverFields = (name: StoredName): ResolverFields => {
  const network = { chain_id: CHAIN_ID, network: NETWORK }
  if (name.isReleased) {
    return name.isEnsV1 && name.resolver
      ? { unresolvable_reason: NO_LIVE_ENS_V2_ENTRY, ...network }
      : network
  }
  return {
    resolver: name.resolver ? contract(name.resolver) : undefined,
    records: recordGroups(name),
    primary_address: name.addresses
      ?.find(({ coinType }) => coinType === 60)
      ?.value.toLowerCase() as Hex | undefined,
    ...network,
  }
}

/** Name detail and lookup detail fields. */
const profileFields = (name: StoredName, now: number): NameProfileFields => ({
  ...nameRowFields(name, now),
  registration_id: registrationId(name),
  token_id: name.isDotEth2ld
    ? BigInt(labelhash(name.name.split('.')[0])).toString()
    : undefined,
  lapsed_registration: lapsedRegistration(name),
  migrated_at: migratedAt(name),
  ...resolverFields(name),
})

/** `profile=feed`: identity, chain, status and the expiry fields with `ens_v1`. */
const feedRecord = (name: StoredName): LookupFeedRecord => ({
  name: name.name,
  display_name: name.name,
  namespace: 'ens',
  namehash: name.node,
  ...expiryFields(name),
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

/** Current grants; a released name has no current registration to grant on. */
const roleSummary = (name: StoredName): RoleSummaryEntry[] =>
  name.isReleased
    ? []
    : [{ address: name.ownerLower, grants: ownerGrants(name) }]

const restrictions = (name: StoredName): Restrictions | undefined => {
  if (name.isReleased) return undefined
  if (name.authorityValue === 'ens_v2') {
    return {
      registration_id: registrationId(name),
      kind: 'ens_v2_registry',
      locked_roles: [],
    }
  }
  const wrapper = wrapperFields(name)
  if (!wrapper) return undefined
  // A wrapped `.eth` 2LD's NameWrapper entry expires with the lease's grace.
  const wrapperExpiry =
    name.expiresAt === undefined
      ? undefined
      : name.expiresAt + (name.isDotEth2ld ? ENS_V1_GRACE_SECONDS : 0)
  return {
    registration_id: registrationId(name),
    kind: 'ens_v1_wrapper',
    ...wrapper,
    ...(wrapperExpiry === undefined
      ? { wrapper_expires_at: null, wrapper_expires_at_reason: 'not_set' }
      : { wrapper_expires_at: secondsToTimestamp(wrapperExpiry) }),
  }
}

/** Authority relations `address` holds on `name`, in the order bigname lists them. */
const relationsOf = (
  name: StoredName,
  address: string,
  now: number,
): AuthorityRelation[] => {
  const addressLower = address.toLowerCase()
  const { owner, manager } = ownership(name, now)
  const isRoleHolder = roleSummary(name).some(
    (entry) =>
      entry.address === addressLower &&
      entry.grants.some((grant) => grant.grant_scope.kind === 'registry'),
  )
  return [
    ...(owner === addressLower ? (['owner'] as const) : []),
    ...(manager === addressLower ? (['manager'] as const) : []),
    ...(isRoleHolder ? (['role_holder'] as const) : []),
  ]
}

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
  'exclude_type',
  'kind',
  'record_key',
  'order',
  'from_timestamp',
  'to_timestamp',
]

/** Query parameters each route accepts (api-v1-routes.md, v0.4.1). */
const ALLOWED_PARAMS = {
  status: [],
  name: ['namespace', 'source', 'include', ...SNAPSHOT],
  records: ['namespace', 'source', 'keys', 'include', ...SNAPSHOT],
  subnames: [
    'namespace',
    'q',
    'match',
    'sort',
    'order',
    'include_expired',
    'include',
    ...SNAPSHOT,
    ...PAGE,
  ],
  nameHistory: [
    'namespace',
    'scope',
    'include',
    ...SNAPSHOT,
    ...HISTORY_FILTERS,
  ],
  addressNames: [
    'namespace',
    'relation',
    'coin_type',
    'expires_after',
    'expires_before',
    'authority',
    'is_migrated',
    'parent',
    'q',
    'match',
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
    'finality',
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
    ...SNAPSHOT,
    ...HISTORY_FILTERS,
  ],
  names: [
    'namespace',
    'expires_after',
    'expires_before',
    'authority',
    'parent',
    'sort',
    'order',
    'finality',
    ...PAGE,
  ],
  search: ['q', 'match', 'namespace', ...SNAPSHOT, ...PAGE],
  permissions: [
    'name',
    'registration_id',
    'address',
    'namespace',
    'include',
    ...SNAPSHOT,
    ...PAGE,
  ],
  registry: ['include', ...SNAPSHOT, ...PAGE],
  registryLabels: ['include', 'owner', 'exclude_owner', ...SNAPSHOT, ...PAGE],
  resolver: [...SNAPSHOT, ...PAGE],
  namespace: [],
} satisfies Record<string, readonly string[]>

/** Rejects unknown and repeated parameters, as every bigname route does. */
const assertParams = (
  params: URLSearchParams,
  route: keyof typeof ALLOWED_PARAMS,
) => {
  const allowed = new Set<string>(ALLOWED_PARAMS[route])
  for (const key of params.keys()) {
    if (!allowed.has(key)) throw invalid(`unknown query parameter: ${key}`)
    if (params.getAll(key).length > 1) throw invalid(`${key} is repeated`)
  }
}

const listParam = (params: URLSearchParams, key: string): string[] =>
  (params.get(key) ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

/** A comma-separated set drawn from `allowed`; `undefined` when blank. */
const setParam = <const TValue extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly TValue[],
): ReadonlySet<TValue> | undefined => {
  const raw = params.get(key)
  if (raw === null || raw.trim() === '') return undefined
  const values = listParam(params, key)
  if (values.length === 0) throw invalid(`${key} is invalid`)
  const isAllowed = (value: string): value is TValue =>
    (allowed as readonly string[]).includes(value)
  if (!values.every(isAllowed)) throw invalid(`${key} is invalid`)
  return new Set(values.filter(isAllowed))
}

const assertInclude = (params: URLSearchParams, allowed: readonly string[]) =>
  setParam(params, 'include', allowed) ?? new Set<string>()

/** One value of `allowed`, or `fallback` when absent. */
const enumParam = <const TValue extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly TValue[],
  fallback: TValue,
): TValue => {
  const raw = params.get(key)?.trim()
  if (!raw) return fallback
  const value = allowed.find((candidate) => candidate === raw)
  if (value === undefined) throw invalid(`${key} is invalid`)
  return value
}

const DECIMAL_SECONDS = /^(0|[1-9][0-9]*)$/
const RFC_3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i

/** A timestamp input: decimal Unix seconds or RFC 3339 (as bigname accepts). */
const timestampParam = (
  params: URLSearchParams,
  key: string,
): number | undefined => {
  const raw = params.get(key)?.trim()
  if (!raw) return undefined
  if (DECIMAL_SECONDS.test(raw)) return Number(raw)
  const millis = Date.parse(raw)
  if (!RFC_3339.test(raw) || Number.isNaN(millis)) {
    throw invalid(`${key} is invalid`)
  }
  return millis / 1000
}

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

type SortKey = 'name' | 'expires_at' | 'registered_at' | 'created_at'

const sortValue = (
  name: StoredName,
  sort: SortKey,
): string | number | undefined => {
  switch (sort) {
    case 'name':
      return name.name
    case 'expires_at':
      return servedExpirySeconds(name)
    case 'registered_at':
      return name.registeredAt
    case 'created_at':
      return name.createdAtValue
  }
}

/** A missing value is the smallest: first ascending, last descending (v0.1.0+). */
const sortNames = (
  names: readonly StoredName[],
  sort: SortKey,
  params: URLSearchParams,
): StoredName[] => {
  const direction =
    enumParam(params, 'order', ['asc', 'desc'], 'asc') === 'desc' ? -1 : 1
  return [...names].sort((a, b) => {
    const av = sortValue(a, sort)
    const bv = sortValue(b, sort)
    if (av === bv) return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    if (av === undefined) return -direction
    if (bv === undefined) return direction
    return av < bv ? -direction : direction
  })
}

/** `q` with `match=prefix` (default) or `match=contains`. */
const matchesQuery = (name: StoredName, params: URLSearchParams): boolean => {
  const match = enumParam(params, 'match', ['prefix', 'contains'], 'prefix')
  const q = params.get('q')?.trim().toLowerCase()
  if (!q) return true
  return match === 'contains' ? name.name.includes(q) : name.name.startsWith(q)
}

/** `parent`: names exactly one label below it. */
const parentParam = (params: URLSearchParams): string | undefined => {
  const raw = params.get('parent')
  if (raw === null) return undefined
  const parent = raw.trim().toLowerCase()
  if (!parent || parent.startsWith('.') || parent.endsWith('.')) {
    throw invalid('parent is invalid')
  }
  return parent
}

const matchesParent = (name: StoredName, parent: string | undefined) =>
  parent === undefined || parentOf(name.name) === parent

const matchesAuthority = (
  name: StoredName,
  authorities: ReadonlySet<Authority> | undefined,
) => authorities === undefined || authorities.has(name.authorityValue)

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

type NameStore = ReadonlyMap<string, StoredName>

const findName = (store: NameStore, raw: string): StoredName => {
  const name = store.get(raw.toLowerCase())
  if (!name) throw notFound(`name ${raw}`)
  return name
}

/**
 * The mock indexes no chain, so every block field is null and the provider
 * head is `unconfigured`, which the contract reports as `degraded`.
 */
const status = (): BignameResponse<Status> =>
  resource({
    status: 'degraded',
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
        network_head_status: 'unconfigured',
        ingestion_lag_blocks: null,
        ingestion_lag_seconds: null,
        status: 'degraded',
      },
    },
  })

const childrenOf = (store: NameStore, parent: string) =>
  [...store.values()].filter((name) => parentOf(name.name) === parent)

const inventoryKeys = (name: StoredName): RecordKey[] =>
  name.isReleased
    ? []
    : [
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

type ServeContext = {
  readonly store: NameStore
  /** Unix seconds of the request (wall clock, not the fork's block time). */
  readonly now: number
}

const nameDetail = (
  { store, now }: ServeContext,
  raw: string,
  params: URLSearchParams,
): BignameResponse<NameProfile> => {
  assertParams(params, 'name')
  const include = assertInclude(params, ['counts'])
  const name = findName(store, raw)
  return resource({
    ...profileFields(name, now),
    status: 'ok',
    ...(include.has('counts')
      ? {
          subname_count: childrenOf(store, name.name).length,
          record_count: inventoryKeys(name).length,
        }
      : {}),
  })
}

const recordAnswer = (name: StoredName, key: string): RecordAnswer => {
  const parsed = parseRecordKey(key)
  const value = name.isReleased
    ? undefined
    : parsed?.kind === 'text' || parsed?.kind === 'avatar'
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
  { store }: ServeContext,
  raw: string,
  params: URLSearchParams,
): BignameResponse<NameRecords> => {
  assertParams(params, 'records')
  const include = assertInclude(params, ['inventory'])
  const name = findName(store, raw)
  const keys = params.has('keys')
    ? listParam(params, 'keys')
    : inventoryKeys(name)
  return resource({
    namespace: 'ens',
    resolver:
      name.resolver && !name.isReleased ? contract(name.resolver) : null,
    records: Object.fromEntries(
      keys.map((key) => [key, recordAnswer(name, key)]),
    ),
    ...(include.has('inventory') ? { inventory: inventory(name) } : {}),
  })
}

const subnames = (
  { store, now }: ServeContext,
  raw: string,
  params: URLSearchParams,
): BignamePage<SubnameRow> => {
  assertParams(params, 'subnames')
  const include = assertInclude(params, ['counts'])
  const sort = enumParam(
    params,
    'sort',
    ['name', 'expires_at', 'registered_at'],
    'name',
  )
  const includeExpired = enumParam(
    params,
    'include_expired',
    ['true', 'false'],
    'true',
  )
  const parent = findName(store, raw)
  const isLive = (child: StoredName) => {
    const expiry = servedExpirySeconds(child)
    return !child.isReleased && (expiry === undefined || expiry > now)
  }
  const children = sortNames(
    childrenOf(store, parent.name).filter(
      (child) =>
        matchesQuery(child, params) &&
        (includeExpired === 'true' || isLive(child)),
    ),
    sort,
    params,
  )
  const rows = children.map(
    (child): SubnameRow => ({
      ...nameRowFields(child, now),
      labelhash: labelhash(child.name.split('.')[0]),
      ...(include.has('counts')
        ? { subname_count: childrenOf(store, child.name).length }
        : {}),
    }),
  )
  return paginate(rows, params, rows.length)
}

// --- History -----------------------------------------------------------------

const HISTORY_EVENT_TYPES: readonly HistoryEventType[] = [
  'registration',
  'renewal',
  'release',
  'expiry',
  'transfer',
  'authority',
  'resolver',
  'record',
  'primary_name',
  'permission',
  'subregistry',
  'migration',
]

const HISTORY_EVENT_KINDS: readonly HistoryEventKind[] = [
  'RegistrationGranted',
  'LabelRegistered',
  'RegistrationRenewed',
  'RegistrationReleased',
  'ExpiryChanged',
  'TokenControlTransferred',
  'AuthorityTransferred',
  'AuthorityEpochChanged',
  'ResolverChanged',
  'RecordChanged',
  'RecordVersionChanged',
  'ReverseChanged',
  'PermissionChanged',
  'PermissionScopeChanged',
  'RolesChanged',
  'EACRolesChanged',
  'SubregistryChanged',
  'MigrationApplied',
]

const HISTORY_INCLUDE = ['data', 'raw', 'total_count'] as const

/** A history row before the `include` expansions are applied. */
type HistoryEntry = {
  readonly type: HistoryEventType
  readonly kind: HistoryEventKind
  readonly seconds: number
  readonly blockNumber: number
  readonly logIndex: number
  readonly build: (include: ReadonlySet<string>) => HistoryEvent
}

/** The `migration` row of a name with a proven ENSv1→ENSv2 migration. */
const migrationEntry = (name: StoredName): HistoryEntry | undefined => {
  const { migration } = name
  if (!migration || name.isEnsV1) return undefined
  const logIndex = migration.logIndex ?? 0
  return {
    type: 'migration',
    kind: 'MigrationApplied',
    seconds: migration.at,
    blockNumber: migration.blockNumber,
    logIndex,
    build: (include) => ({
      id: keccak256(
        toHex(`${name.node}:${migration.transactionHash}:${logIndex}`),
      ).slice(2),
      type: 'migration',
      name: name.name,
      namespace: 'ens',
      registration_id: registrationId(name),
      block_number: migration.blockNumber,
      timestamp: secondsToTimestamp(migration.at),
      transaction_hash: migration.transactionHash,
      log_index: logIndex,
      ...(include.has('data')
        ? {
            contract_address: migration.contract.toLowerCase() as Hex,
            data: { migration_path: migration.path },
          }
        : {}),
      ...(include.has('raw') ? { kind: 'MigrationApplied' as const } : {}),
    }),
  }
}

/**
 * The shared history filters (api-v1-routes.md, History collection filters)
 * applied to `entries`, newest first unless `order=asc`, then paginated.
 */
const historyPage = (
  entries: readonly HistoryEntry[],
  params: URLSearchParams,
  include: ReadonlySet<string>,
): BignamePage<HistoryEvent> => {
  enumParam(params, 'scope', ['name', 'registration', 'both'], 'both')
  const types = setParam(params, 'type', HISTORY_EVENT_TYPES)
  const excluded = setParam(params, 'exclude_type', HISTORY_EVENT_TYPES)
  const kinds = setParam(params, 'kind', HISTORY_EVENT_KINDS)
  const recordKey = params.get('record_key')
  if (recordKey !== null && (recordKey === '' || recordKey.includes('\0'))) {
    throw invalid('record_key is invalid')
  }
  const from = timestampParam(params, 'from_timestamp')
  const to = timestampParam(params, 'to_timestamp')
  if (from !== undefined && to !== undefined && from > to) {
    throw invalid('from_timestamp must not be after to_timestamp')
  }
  const direction =
    enumParam(params, 'order', ['asc', 'desc'], 'desc') === 'asc' ? 1 : -1

  const rows = entries
    .filter(
      (entry) =>
        (types === undefined || types.has(entry.type)) &&
        !excluded?.has(entry.type) &&
        (kinds === undefined || kinds.has(entry.kind)) &&
        // The mock serves no record writes, the only rows `record_key` keeps.
        (recordKey === null || entry.type === 'record') &&
        (from === undefined || entry.seconds >= from) &&
        (to === undefined || entry.seconds <= to),
    )
    .sort(
      (a, b) =>
        direction * (a.blockNumber - b.blockNumber || a.logIndex - b.logIndex),
    )
    .map((entry) => entry.build(include))
  return paginate(rows, params, include.has('total_count') ? rows.length : null)
}

/** Known names serve only their `migration` row; every other kind is unmocked. */
const nameHistory = (
  { store }: ServeContext,
  raw: string,
  params: URLSearchParams,
): BignamePage<HistoryEvent> => {
  assertParams(params, 'nameHistory')
  const include = assertInclude(params, [
    ...HISTORY_INCLUDE,
    'child_registrations',
  ])
  const name = findName(store, raw)
  const migration = migrationEntry(name)
  return historyPage(migration ? [migration] : [], params, include)
}

/** No address-history rows are mocked; the filters are still validated. */
const addressHistory = (params: URLSearchParams): BignamePage<EventRow> => {
  assertParams(params, 'addressHistory')
  const include = assertInclude(params, HISTORY_INCLUDE)
  // `resolves_to` and `former_owner` are not history relations; `registrant`
  // was removed in v0.3.0.
  setParam(params, 'relation', ['owner', 'manager', 'role_holder', 'any'])
  return historyPage([], params, include)
}

/** No contract-feed rows are mocked; the filters are still validated. */
const events = (params: URLSearchParams): BignamePage<EventRow> => {
  assertParams(params, 'events')
  const include = assertInclude(params, HISTORY_INCLUDE)
  return historyPage([], params, include)
}

// --- Address names -------------------------------------------------------------

type AuthorityRelationSet = ReadonlySet<AuthorityRelation>

type RelationFilter =
  | { readonly kind: 'authority'; readonly relations: AuthorityRelationSet }
  | { readonly kind: 'resolves_to'; readonly coinType: number | 'evm' }
  | { readonly kind: 'former_owner' }

const AUTHORITY_RELATIONS: readonly AuthorityRelation[] = [
  'owner',
  'manager',
  'role_holder',
]

const parseCoinType = (raw: string | null): number | 'evm' => {
  if (raw === null || raw.trim() === '') return 60
  if (raw.trim() === 'evm') return 'evm'
  const coinType = Number(raw)
  if (!DECIMAL_SECONDS.test(raw.trim()) || !Number.isSafeInteger(coinType)) {
    throw invalid('coin_type must be a decimal coin type or evm')
  }
  return coinType
}

const parseAuthorityRelations = (
  values: readonly string[],
): AuthorityRelationSet => {
  const relations = new Set<AuthorityRelation>()
  for (const value of values) {
    const expanded =
      value === 'any'
        ? AUTHORITY_RELATIONS
        : AUTHORITY_RELATIONS.filter((relation) => relation === value)
    if (expanded.length === 0) throw invalid('relation is invalid')
    for (const relation of expanded) relations.add(relation)
  }
  return relations
}

/**
 * `relation` on address names: a set of `owner`, `manager`, `role_holder`
 * (`any` is all three), or `resolves_to` / `former_owner` alone.
 * `registrant` (removed in v0.3.0) is an unknown value.
 */
const parseRelation = (params: URLSearchParams): RelationFilter => {
  const values = (params.get('relation') ?? 'any')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (values.length === 0) throw invalid('relation is invalid')
  const standalone = (['resolves_to', 'former_owner'] as const).find((value) =>
    values.includes(value),
  )
  if (standalone !== undefined && values.length > 1) {
    throw invalid(`${standalone} cannot be combined with other relations`)
  }
  switch (standalone) {
    case 'resolves_to':
      return {
        kind: 'resolves_to',
        coinType: parseCoinType(params.get('coin_type')),
      }
    case 'former_owner':
      return { kind: 'former_owner' }
    default:
      return { kind: 'authority', relations: parseAuthorityRelations(values) }
  }
}

/** Parameters `relation=former_owner` rejects (api-v1-routes.md). */
const FORMER_OWNER_REJECTS = ['coin_type', 'authority', 'is_migrated', 'q']

const assertFormerOwnerParams = (params: URLSearchParams) => {
  const rejected = FORMER_OWNER_REJECTS.find((key) => params.has(key))
  if (rejected !== undefined) {
    throw invalid(`${rejected} is rejected with relation=former_owner`)
  }
  if (listParam(params, 'include').length > 0) {
    throw invalid('include is rejected with relation=former_owner')
  }
  if (params.get('dedupe') === 'registration') {
    throw invalid('dedupe=registration is rejected with relation=former_owner')
  }
  if (params.has('sort') && params.get('sort') !== 'expires_at') {
    throw invalid('relation=former_owner accepts only sort=expires_at')
  }
}

const assertRelationParams = (
  params: URLSearchParams,
  relation: RelationFilter,
) => {
  if (relation.kind === 'former_owner') {
    assertFormerOwnerParams(params)
    return
  }
  if (relation.kind !== 'resolves_to' && params.has('coin_type')) {
    throw invalid('coin_type is accepted only with relation=resolves_to')
  }
  if (relation.kind === 'resolves_to' && params.has('is_migrated')) {
    throw invalid('is_migrated is rejected with relation=resolves_to')
  }
  const windowed = ['expires_after', 'expires_before'].find((key) =>
    params.has(key),
  )
  if (windowed !== undefined) {
    throw invalid(`${windowed} is accepted only with relation=former_owner`)
  }
}

type AddressNamesQuery = {
  readonly addressLower: Hex
  readonly relation: RelationFilter
  readonly authorities: ReadonlySet<Authority> | undefined
  readonly parent: string | undefined
  readonly isMigrated: 'true' | 'false' | undefined
  readonly expiresAfter: number | undefined
  readonly expiresBefore: number | undefined
  readonly include: ReadonlySet<string>
}

const matchesAddressNamesFilters = (
  name: StoredName,
  query: AddressNamesQuery,
  params: URLSearchParams,
): boolean => {
  if (!matchesAuthority(name, query.authorities)) return false
  if (!matchesParent(name, query.parent)) return false
  if (query.isMigrated !== undefined) {
    const migrated = !name.isEnsV1 && name.migration !== undefined
    if (migrated !== (query.isMigrated === 'true')) return false
  }
  return matchesQuery(name, params)
}

type RelationFields = Pick<
  AddressNameRow,
  'relations' | 'resolution' | 'resolutions' | 'lapsed_registration'
>

/** A released name the address last held, inside the `expires_*` window. */
const formerOwnerFields = (
  name: StoredName,
  query: AddressNamesQuery,
): RelationFields | null => {
  const lapsed = lapsedRegistration(name)
  if (lapsed?.owner !== query.addressLower) return null
  const expiry = servedExpirySeconds(name)
  const isWindowed =
    query.expiresAfter !== undefined || query.expiresBefore !== undefined
  const inWindow =
    expiry !== undefined &&
    expiry >= (query.expiresAfter ?? -Infinity) &&
    expiry < (query.expiresBefore ?? Infinity)
  return !isWindowed || inWindow
    ? { relations: ['former_owner'], lapsed_registration: lapsed }
    : null
}

/** A name whose `addr:<coin_type>` record holds the address. */
const resolvesToFields = (
  name: StoredName,
  addressLower: string,
  coinType: number | 'evm',
): RelationFields | null => {
  // A released name resolves to nothing.
  if (name.isReleased) return null
  const resolutions: Resolution[] = sortedAddresses(name)
    .filter(
      (record) =>
        record.value.toLowerCase() === addressLower &&
        (coinType === 'evm'
          ? isEvmCoinType(record.coinType)
          : record.coinType === coinType),
    )
    .map((record) => ({
      coin_type: record.coinType,
      record_key: `addr:${record.coinType}`,
    }))
  if (resolutions.length === 0) return null
  return coinType === 'evm'
    ? { relations: ['resolves_to'], resolutions }
    : { relations: ['resolves_to'], resolution: resolutions[0] }
}

/** The relation-specific part of a row, or null when the name does not match. */
const relationFields = (
  name: StoredName,
  query: AddressNamesQuery,
  now: number,
): RelationFields | null => {
  const { relation, addressLower } = query
  switch (relation.kind) {
    case 'authority': {
      const relations = relationsOf(name, addressLower, now).filter((value) =>
        relation.relations.has(value),
      )
      return relations.length > 0 ? { relations } : null
    }
    case 'former_owner':
      return formerOwnerFields(name, query)
    case 'resolves_to':
      return resolvesToFields(name, addressLower, relation.coinType)
  }
}

const addressNameRow = (
  store: NameStore,
  name: StoredName,
  query: AddressNamesQuery,
  now: number,
  fields: RelationFields,
): AddressNameRow => {
  const withRoleSummary = query.include.has('role_summary')
  return {
    ...nameRowFields(name, now),
    permission_resource_id: registrationId(name),
    migrated_at: migratedAt(name),
    is_primary:
      name.isPrimary === true &&
      !name.isReleased &&
      name.ownerLower === query.addressLower,
    ...fields,
    ...(withRoleSummary
      ? { role_summary: roleSummary(name), restrictions: restrictions(name) }
      : {}),
    ...(query.include.has('counts')
      ? { subname_count: childrenOf(store, name.name).length }
      : {}),
    ...(query.include.has('counts') || withRoleSummary
      ? { record_count: inventoryKeys(name).length }
      : {}),
  }
}

const addressNames = (
  { store, now }: ServeContext,
  address: string,
  params: URLSearchParams,
): BignamePage<AddressNameRow> => {
  assertParams(params, 'addressNames')
  const relation = parseRelation(params)
  assertRelationParams(params, relation)
  const isFormerOwner = relation.kind === 'former_owner'
  enumParam(params, 'dedupe', ['name', 'registration'], 'name')
  const query: AddressNamesQuery = {
    addressLower: address.toLowerCase() as Hex,
    relation,
    authorities: setParam(params, 'authority', AUTHORITIES),
    parent: parentParam(params),
    isMigrated: params.has('is_migrated')
      ? enumParam(params, 'is_migrated', ['true', 'false'], 'false')
      : undefined,
    expiresAfter: timestampParam(params, 'expires_after'),
    expiresBefore: timestampParam(params, 'expires_before'),
    include: assertInclude(params, ['counts', 'role_summary']),
  }
  const sort = enumParam<SortKey>(
    params,
    'sort',
    ['name', 'expires_at', 'registered_at', 'created_at'],
    isFormerOwner ? 'expires_at' : 'name',
  )

  const rows = sortNames([...store.values()], sort, params).flatMap(
    (name): AddressNameRow[] => {
      if (!matchesAddressNamesFilters(name, query, params)) return []
      const fields = relationFields(name, query, now)
      return fields ? [addressNameRow(store, name, query, now, fields)] : []
    },
  )

  // Exact for authority relations (as bigname), null for the standalone ones.
  return paginate(
    rows,
    params,
    query.relation.kind === 'authority' ? rows.length : null,
  )
}

const primaryNameOf = (
  store: NameStore,
  addressLower: string,
): StoredName | undefined =>
  [...store.values()].find(
    (name) =>
      name.isPrimary && !name.isReleased && name.ownerLower === addressLower,
  )

const primaryName = (
  { store }: ServeContext,
  address: string,
  params: URLSearchParams,
): BignameResponse<PrimaryName> => {
  assertParams(params, 'primaryName')
  const addressLower = address.toLowerCase() as Hex
  const primary = primaryNameOf(store, addressLower)
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

// --- Listings ------------------------------------------------------------------

const listNames = (
  { store, now }: ServeContext,
  params: URLSearchParams,
): BignamePage<NameListRow> => {
  assertParams(params, 'names')
  if (!params.get('namespace')?.trim()) {
    throw invalid(
      'namespace is required because this listing is namespace-scoped',
    )
  }
  const after = timestampParam(params, 'expires_after')
  const before = timestampParam(params, 'expires_before')
  if (after === undefined && before === undefined) {
    throw invalid('expires_after or expires_before is required')
  }
  if (after !== undefined && before !== undefined && after >= before) {
    throw invalid('expires_after must be earlier than expires_before')
  }
  const sort = enumParam(params, 'sort', ['expires_at'], 'expires_at')
  const authorities = setParam(params, 'authority', AUTHORITIES)
  const parent = parentParam(params)
  const rows = sortNames(
    [...store.values()].filter((name) => {
      // The window applies to the served (top-level) expiry.
      const expiry = servedExpirySeconds(name)
      return (
        expiry !== undefined &&
        expiry >= (after ?? -Infinity) &&
        expiry < (before ?? Infinity) &&
        matchesAuthority(name, authorities) &&
        matchesParent(name, parent)
      )
    }),
    sort,
    params,
  ).map((name) => listRow(name, now))
  return paginate(rows, params, null)
}

const search = (
  { store, now }: ServeContext,
  params: URLSearchParams,
): BignamePage<NameListRow> => {
  assertParams(params, 'search')
  if (!params.get('q')?.trim()) throw invalid('q is required')
  const rows = sortNames(
    [...store.values()].filter((name) => matchesQuery(name, params)),
    'name',
    params,
  ).map((name) => listRow(name, now))
  return paginate(rows, params, null)
}

const permissions = (
  { store }: ServeContext,
  params: URLSearchParams,
): PermissionsPage => {
  assertParams(params, 'permissions')
  assertInclude(params, ['lineage'])
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
        entry.grants.map(
          (grant): PermissionRow => ({
            address: entry.address,
            ...grant,
            registration_id: registrationId(name),
            name: name.name,
            authority_context: 'current_for_name',
            // Permission rows keep the wrapper fields top-level.
            ...wrapperFields(name),
          }),
        ),
      ),
  )
  const restriction = bound ? restrictions(bound) : undefined
  return {
    ...paginate(rows, params, null),
    ...(restriction ? { restrictions: restriction } : {}),
  }
}

// --- Lookup ----------------------------------------------------------------------

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const optionalString = (value: unknown, field: string): string | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw invalid(`${field} must be a string`)
  return value
}

const optionalNumber = (value: unknown, field: string): number | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw invalid(`${field} must be an integer`)
  }
  return value
}

type LookupRelationFilter =
  | { readonly kind: 'primary' }
  | { readonly kind: 'authority'; readonly relations: AuthorityRelationSet }
  | { readonly kind: 'resolves_to' }

/**
 * Lookup reverse `relation`: a set of `owner` and `manager` (`any` is both),
 * or `resolves_to` alone; omitted asks for the address's primary name.
 * `role_holder` is not served here, and `registrant` is an unknown value.
 */
const parseLookupRelation = (raw: string | undefined): LookupRelationFilter => {
  if (raw === undefined) return { kind: 'primary' }
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (values.includes('role_holder')) {
    throw invalid('relation=role_holder is not supported for lookup')
  }
  if (values.includes('resolves_to')) {
    if (values.length > 1) {
      throw invalid('resolves_to cannot be combined with other relations')
    }
    return { kind: 'resolves_to' }
  }
  const relations = new Set<AuthorityRelation>()
  for (const value of values) {
    if (value === 'any') {
      relations.add('owner')
      relations.add('manager')
    } else if (value === 'owner' || value === 'manager') {
      relations.add(value)
    } else {
      throw invalid('relation is invalid')
    }
  }
  if (relations.size === 0) throw invalid('relation is invalid')
  return { kind: 'authority', relations }
}

/** The normalized relation lookup echoes (`any` → `owner,manager`). */
const echoedRelation = (relation: LookupRelationFilter): string | undefined => {
  switch (relation.kind) {
    case 'primary':
      return undefined
    case 'resolves_to':
      return 'resolves_to'
    case 'authority':
      return (['owner', 'manager'] as const)
        .filter((value) => relation.relations.has(value))
        .join(',')
  }
}

type AnyLookupResult = LookupResult<'feed'> | LookupResult<'detail'>

const lookupName = (
  { store, now }: ServeContext,
  input: Record<string, unknown>,
  profile: LookupProfile,
): AnyLookupResult => {
  const rawName = optionalString(input.name, 'name') ?? ''
  const id = optionalString(input.id, 'id')
  const echo = { ...(id === undefined ? {} : { id }), name: rawName }
  const normalized = rawName.toLowerCase()
  const normalization =
    normalized === rawName
      ? {}
      : {
          normalization: {
            changed: true,
            input_name: rawName,
            reason: 'case_normalized' as const,
          },
        }
  const name = store.get(normalized)
  if (!name) {
    return { kind: 'name', input: echo, status: 'not_found', ...normalization }
  }
  return profile === 'feed'
    ? {
        kind: 'name',
        input: echo,
        status: 'ok',
        ...normalization,
        record: feedRecord(name),
      }
    : {
        kind: 'name',
        input: echo,
        status: 'ok',
        ...normalization,
        record: { ...profileFields(name, now), status: 'ok' },
      }
}

/** One name a reverse lookup input lists, with the relations it matched. */
type ReverseMatch = {
  readonly name: StoredName
  readonly relations: readonly AddressRelation[]
  readonly resolution?: Resolution
}

/** A reverse lookup input: the address's names under its relation, one page. */
const lookupAddress = (
  { store, now }: ServeContext,
  input: Record<string, unknown>,
  profile: LookupProfile,
): AnyLookupResult => {
  const address = optionalString(input.address, 'address') ?? ''
  const addressLower = address.toLowerCase()
  const coinType = optionalNumber(input.coin_type, 'coin_type') ?? 60
  const pageSize = optionalNumber(input.page_size, 'page_size')
  const cursor = optionalString(input.cursor, 'cursor')
  const id = optionalString(input.id, 'id')
  const relation = parseLookupRelation(
    optionalString(input.relation, 'relation'),
  )
  const relationEcho = echoedRelation(relation)
  const echo: LookupResultInput & { readonly address: string } = {
    ...(id === undefined ? {} : { id }),
    address,
    coin_type: coinType,
    ...(relationEcho === undefined ? {} : { relation: relationEcho }),
    ...(pageSize === undefined ? {} : { page_size: pageSize }),
    ...(cursor === undefined ? {} : { cursor }),
  }

  const primary = primaryNameOf(store, addressLower)
  const matches = [...store.values()].flatMap((name): ReverseMatch[] => {
    if (name.isReleased) return []
    if (relation.kind === 'resolves_to') {
      const resolves = name.addresses?.some(
        (record) =>
          record.coinType === coinType &&
          record.value.toLowerCase() === addressLower,
      )
      return resolves
        ? [
            {
              name,
              relations: ['resolves_to'],
              resolution: {
                coin_type: coinType,
                record_key: `addr:${coinType}`,
              },
            },
          ]
        : []
    }
    const held = relationsOf(name, addressLower, now).filter(
      (value) => value === 'owner' || value === 'manager',
    )
    const wanted =
      relation.kind === 'primary'
        ? name === primary
          ? held
          : []
        : held.filter((value) => relation.relations.has(value))
    return wanted.length > 0 ? [{ name, relations: wanted }] : []
  })

  const params = new URLSearchParams()
  if (pageSize !== undefined) params.set('page_size', String(pageSize))
  if (cursor) params.set('cursor', cursor)
  const reverse = (match: ReverseMatch) => ({
    is_primary: match.name === primary,
    relations: match.relations,
    ...(match.resolution ? { resolution: match.resolution } : {}),
  })
  const totalCount = relation.kind === 'resolves_to' ? null : matches.length

  if (profile === 'feed') {
    const { data, page } = paginate(
      matches.map(
        (match): LookupAddressRecord<'feed'> => ({
          ...feedRecord(match.name),
          ...reverse(match),
        }),
      ),
      params,
      totalCount,
    )
    return { kind: 'address', input: echo, status: 'ok', records: data, page }
  }
  const { data, page } = paginate(
    matches.map((match): LookupAddressRecord<'detail'> => {
      const record: LookupProfileRecord = {
        ...profileFields(match.name, now),
        status: 'ok',
      }
      return { ...record, ...reverse(match) }
    }),
    params,
    totalCount,
  )
  return { kind: 'address', input: echo, status: 'ok', records: data, page }
}

const LOOKUP_BATCH_LIMIT = 1000

const lookup = (
  context: ServeContext,
  rawBody: string | null,
): BignameResponse<readonly AnyLookupResult[]> => {
  let body: unknown
  try {
    body = JSON.parse(rawBody ?? '')
  } catch {
    throw invalid('request body must be JSON')
  }
  if (!isRecordObject(body)) throw invalid('request body must be an object')
  if ('include' in body) {
    throw invalid(
      'include is not supported; profile=detail records list their record keys under records',
    )
  }
  const profile = body.profile ?? 'detail'
  if (profile !== 'feed' && profile !== 'detail') {
    throw invalid('profile must be feed or detail')
  }
  const { inputs } = body
  if (!Array.isArray(inputs) || inputs.length > LOOKUP_BATCH_LIMIT) {
    throw invalid(
      `inputs must be an array of at most ${LOOKUP_BATCH_LIMIT} entries`,
    )
  }
  const results = inputs.map((input: unknown): AnyLookupResult => {
    if (!isRecordObject(input)) throw invalid('each input must be an object')
    if (typeof input.name === 'string') {
      return lookupName(context, input, profile)
    }
    if (typeof input.address === 'string') {
      return lookupAddress(context, input, profile)
    }
    throw invalid('each input needs a name or an address')
  })
  return resource(results)
}

const namespaceInfo = (namespace: string): BignameResponse<NamespaceInfo> => {
  if (namespace !== 'ens') throw notFound(`namespace ${namespace}`)
  return resource({
    namespace,
    capabilities: {},
    networks: [
      {
        network: NETWORK,
        chain_id: CHAIN_ID,
        resolution: {
          protocol: 'ens_v2',
          since_block: SEPOLIA_RESOLUTION_SINCE_BLOCK,
        },
      },
    ],
  })
}

// --- Routing ---------------------------------------------------------------------

type RouteArgs = ServeContext & {
  /** Path segments after the route head, decoded. */
  readonly rest: readonly string[]
  readonly params: URLSearchParams
}

/** `undefined` means the path is not a route. */
type RouteHandler = (args: RouteArgs) => unknown

const namesRoute: RouteHandler = ({ rest, params, ...context }) => {
  if (rest.length === 0) return listNames(context, params)
  const [name, sub, ...extra] = rest
  if (extra.length > 0) return undefined
  switch (sub) {
    case undefined:
      return nameDetail(context, name, params)
    case 'records':
      return nameRecords(context, name, params)
    case 'subnames':
      return subnames(context, name, params)
    case 'history':
      return nameHistory(context, name, params)
    default:
      return undefined
  }
}

const addressesRoute: RouteHandler = ({ rest, params, ...context }) => {
  const [address, sub, ...extra] = rest
  if (!address || extra.length > 0) return undefined
  switch (sub) {
    case 'names':
      return addressNames(context, address, params)
    case 'primary-name':
      return primaryName(context, address, params)
    case 'history':
      return addressHistory(params)
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
    assertInclude(params, ['counts'])
    if (params.has('owner') && params.has('exclude_owner')) {
      throw invalid('owner and exclude_owner cannot be combined')
    }
    return emptyPage(params, 0)
  }
  return undefined
}

/**
 * No resolver overviews are mocked: detail is 404, `links` and `roles` empty.
 * `/aliases` was removed in v0.3.0 and is not a route (404).
 */
const resolversRoute: RouteHandler = ({ rest, params }) => {
  if (rest.length === 2) {
    assertParams(params, 'resolver')
    throw notFound(`resolver ${rest.join(':')}`)
  }
  if (rest.length === 3 && ['links', 'roles'].includes(rest[2])) {
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
  events: ({ rest, params }) => (rest.length > 0 ? undefined : events(params)),
  search: ({ rest, params, ...context }) =>
    rest.length > 0 ? undefined : search(context, params),
  permissions: ({ rest, params, ...context }) =>
    rest.length > 0 ? undefined : permissions(context, params),
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
  context: ServeContext,
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
    return lookup(context, body)
  }
  const handler =
    method === 'GET' && Object.hasOwn(GET_ROUTES, head)
      ? GET_ROUTES[head]
      : undefined
  const result = handler?.({ ...context, rest, params })
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

const errorEnvelope = (
  code: ErrorEnvelope['error']['code'],
  message: string,
): ErrorEnvelope => ({ error: { code, message, details: {} } })

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
        { store: storeFor(page), now: Math.floor(Date.now() / 1000) },
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
        await route.fulfill({
          status: error.status,
          json: errorEnvelope(error.code, error.message),
          headers: CORS_HEADERS,
        })
        return
      }
      console.error('[mock-bigname] error handling request:', error)
      await route.fulfill({
        status: 500,
        json: errorEnvelope('internal_error', String(error)),
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
