import type { AddressName } from '@ens-apps/indexer/bigname'
import type { NameSummary, ProtocolVersion } from '@ens-apps/indexer/reads'
import {
  SECONDS_PER_DAY,
  V2_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import type { Hex } from 'viem'
import { isNormalizedName } from '@/features/register-v2/utils/name-parser'

export type DashboardNameRole = 'owner' | 'manager'
export type SortField = 'name' | 'created' | 'expiry'
export type SortDir = 'asc' | 'desc'
export type NameVersion = ProtocolVersion

/** One name related to the connected addresses, as the dashboard lists it. */
export type DashboardName = {
  readonly key: Hex
  readonly name: string
  readonly protocol: ProtocolVersion
  /** Unix seconds; `0n` when the name does not expire. */
  readonly expiryDate: bigint
  /** Exact served expiry bigname sorts by; a reserved ENSv1 name's reservation. */
  readonly servedExpiry: bigint | null
  readonly createdAt: bigint | null
  readonly nameRoles: readonly DashboardNameRole[]
  /** An ENSv2 name the address held until it expired, still renewable in grace. */
  readonly isLapsed: boolean
}

const DASHBOARD_ROLES: readonly DashboardNameRole[] = ['owner', 'manager']

const HIDDEN_STATUSES: readonly NameSummary['registrationStatus'][] = [
  'released',
  'unregistered',
]

const toSeconds = (date: Date | null): bigint | null =>
  date ? BigInt(Math.floor(date.getTime() / 1000)) : null

// An un-normalised name would render as the canonical name it resembles.
export const isListedName = (name: NameSummary): boolean =>
  !name.name.endsWith('.reverse') &&
  !HIDDEN_STATUSES.includes(name.registrationStatus) &&
  isNormalizedName(name.name)

// bigname's `owner` is the token holder; a registry controller or an ENSv2
// role holder manages.
const toNameRoles = (
  relations: NameSummary['relations'],
): readonly DashboardNameRole[] =>
  DASHBOARD_ROLES.filter((role) =>
    role === 'owner'
      ? relations.includes('owner')
      : relations.includes('manager') || relations.includes('role_holder'),
  )

export const toDashboardName = (name: NameSummary): DashboardName => ({
  key: name.namehash,
  name: name.name,
  protocol: name.protocol ?? 'v2',
  expiryDate: toSeconds(name.expiresAt) ?? 0n,
  servedExpiry: name.servedExpiry,
  createdAt: toSeconds(name.createdAt),
  nameRoles: toNameRoles(name.relations),
  isLapsed: false,
})

/** Names the connected accounts hold, or held until a grace they can still renew in. */
export const isHeldName = (name: DashboardName): boolean =>
  name.nameRoles.includes('owner') || name.isLapsed

const V2_GRACE_SECONDS = BigInt(V2_GRACE_PERIOD_DAYS * SECONDS_PER_DAY)
const ETH_2LD = /^[^.]+\.eth$/

const parseSeconds = (timestamp: string | undefined): bigint | null =>
  timestamp !== undefined && /^\d+$/.test(timestamp) ? BigInt(timestamp) : null

/**
 * An ENSv2 `.eth` name the address held until it expired, still renewable.
 * It holds no current role, so it carries none.
 */
export const toGraceName = (
  row: AddressName,
  address: string,
  now: Date,
): DashboardName | null => {
  const expiryDate = parseSeconds(row.expires_at)
  const nowSeconds = BigInt(Math.floor(now.getTime() / 1000))
  const isGrace =
    row.authority === 'ens_v2' &&
    row.status === 'expired' &&
    row.lapsed_registration?.release_kind === 'expired' &&
    row.lapsed_registration.owner?.toLowerCase() === address.toLowerCase() &&
    expiryDate !== null &&
    expiryDate <= nowSeconds &&
    nowSeconds < expiryDate + V2_GRACE_SECONDS &&
    ETH_2LD.test(row.name) &&
    isNormalizedName(row.name)
  if (!isGrace) return null
  return {
    key: row.namehash,
    name: row.name,
    protocol: 'v2',
    expiryDate,
    servedExpiry: expiryDate,
    createdAt: parseSeconds(row.created_at),
    nameRoles: [],
    isLapsed: true,
  }
}

const byProtocolV2First = (left: DashboardName, right: DashboardName) =>
  Number(right.protocol === 'v2') - Number(left.protocol === 'v2')

/**
 * Rows for one name from several addresses collapse into one, with the roles
 * of every address. A current row wins over a grace row for the same name.
 */
export const mergeDashboardNames = (
  names: readonly DashboardName[],
): readonly DashboardName[] =>
  Array.from(new Set(names.map(({ key }) => key))).flatMap((key) => {
    const rows = names
      .filter((name) => name.key === key)
      .sort(byProtocolV2First)
    const current = rows.find((row) => row.nameRoles.length > 0) ?? rows[0]
    if (!current) return []
    return [
      {
        ...current,
        nameRoles: DASHBOARD_ROLES.filter((role) =>
          rows.some((row) => row.nameRoles.includes(role)),
        ),
      },
    ]
  })

// bigname orders names with a locale collation that compares letters and
// digits first, so punctuation and symbols only break ties.
const NAME_COLLATOR = new Intl.Collator('en', { sensitivity: 'variant' })
const collationKey = (name: string) => name.replace(/[^\p{L}\p{N}]/gu, '')

const compareNames = (left: string, right: string): number =>
  NAME_COLLATOR.compare(collationKey(left), collationKey(right)) ||
  NAME_COLLATOR.compare(left, right) ||
  (left < right ? -1 : left > right ? 1 : 0)

const compareTimes = (left: bigint | null, right: bigint | null): number => {
  // A row with no timestamp is the smallest value, as bigname sorts it.
  const a = left ?? -1n
  const b = right ?? -1n
  return a === b ? 0 : a < b ? -1 : 1
}

/** bigname's order for a sort: the field, then the namehash ascending in both directions. */
export const compareDashboardNames =
  (field: SortField, dir: SortDir) =>
  (left: DashboardName, right: DashboardName): number => {
    const sign = dir === 'asc' ? 1 : -1
    const byField =
      field === 'name'
        ? compareNames(left.name, right.name)
        : field === 'expiry'
          ? compareTimes(left.servedExpiry, right.servedExpiry)
          : compareTimes(left.createdAt, right.createdAt)
    return (
      byField * sign ||
      (left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
    )
  }

/** One page of one address's names, as listed by bigname. */
export type AddressNamesChunk = {
  readonly address: string
  readonly names: readonly DashboardName[]
  /** Rows bigname listed that the dashboard hides, such as reverse records. */
  readonly hiddenCount: number
  /** The last row bigname returned, hidden or not: how far the read has reached. */
  readonly lastRead: DashboardName | null
  readonly nextCursor: string | null
  readonly totalCount: number | null
}

export type MergedDashboardNames = {
  /** Every name that is safe to show, in bigname's order. */
  readonly names: readonly DashboardName[]
  readonly isComplete: boolean
  /** Exact once complete; until then bigname's totals less what was hidden or shared. */
  readonly total: number
}

/**
 * The names a one-based page shows, and how many merged names it needs. The
 * page is clamped to the last one: until every chunk is read the total can
 * count rows that later turn out hidden, so the pager may offer a page that
 * no longer exists.
 */
export const toDashboardPage = (
  merged: MergedDashboardNames,
  page: number,
  pageSize: number,
): { readonly names: readonly DashboardName[]; readonly needed: number } => {
  const lastPage = Math.max(1, Math.ceil(merged.total / pageSize))
  const needed = Math.min(page, lastPage) * pageSize
  return { names: merged.names.slice(needed - pageSize, needed), needed }
}

// A name is shown once every address with more to read has reached it, so a
// later page never slots in ahead of a shown one.
export const mergeDashboardChunks = ({
  chunks,
  graceNames,
  field,
  dir,
}: {
  readonly chunks: readonly AddressNamesChunk[]
  readonly graceNames: readonly DashboardName[]
  readonly field: SortField
  readonly dir: SortDir
}): MergedDashboardNames => {
  const compare = compareDashboardNames(field, dir)
  const addresses = Array.from(new Set(chunks.map(({ address }) => address)))
  const perAddress = addresses.map((address) => {
    const own = chunks.filter((chunk) => chunk.address === address)
    return {
      names: own.flatMap((chunk) => chunk.names),
      hiddenCount: own.reduce((sum, chunk) => sum + chunk.hiddenCount, 0),
      isExhausted: own.at(-1)?.nextCursor === null,
      totalCount: own[0]?.totalCount ?? null,
      lastRead: own.flatMap((chunk) => chunk.lastRead ?? []).at(-1) ?? null,
    }
  })
  // Each address with more to read has reached its last row read, hidden rows
  // included; one that has read nothing yet holds every name back.
  const frontiers = perAddress.filter(({ isExhausted }) => !isExhausted)
  const isBlocked = frontiers.some(({ lastRead }) => lastRead === null)
  const bound = frontiers
    .flatMap(({ lastRead }) => lastRead ?? [])
    .sort(compare)[0]
  const loaded = [...perAddress.flatMap(({ names }) => names), ...graceNames]
  const merged = [...mergeDashboardNames(loaded)].sort(compare)
  const isComplete = perAddress.every(({ isExhausted }) => isExhausted)
  const names = isBlocked
    ? []
    : merged.filter((name) => !bound || compare(name, bound) <= 0)
  const shared = loaded.length - merged.length
  const listed = perAddress.reduce(
    (sum, { totalCount, hiddenCount, names: own }) =>
      sum + (totalCount ?? own.length + hiddenCount) - hiddenCount,
    0,
  )
  return {
    names,
    isComplete,
    total: isComplete ? merged.length : listed + graceNames.length - shared,
  }
}

const toComparableName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/\.eth$/, '')

/**
 * A just-migrated name the list does not show as ENSv2 yet. Between address
 * reads it can be in neither list, so absence keeps the polling going; the
 * recorded names expire, which bounds it.
 */
export const isAwaitingMigratedNames = (
  chunks: readonly AddressNamesChunk[],
  migratedNames: readonly string[],
  version: NameVersion | null = null,
): boolean => {
  if (migratedNames.length === 0) return false
  const names = chunks.flatMap((chunk) => chunk.names)
  const byProtocol = (protocol: NameVersion) =>
    new Set(
      names
        .filter((name) => name.protocol === protocol)
        .map((name) => toComparableName(name.name)),
    )
  const v1 = byProtocol('v1')
  const v2 = byProtocol('v2')
  return migratedNames
    .map(toComparableName)
    .some((name) => (version === 'v1' ? v1.has(name) : !v2.has(name)))
}
