import {
  type AddressNameRow,
  type Authority,
  hasAnyGrant,
  type RegistrationStatus,
  timestampToSeconds,
} from '@ens-apps/bigname'
import {
  getDaysSinceExpiry,
  getDisplayExpiryDate,
  getGraceEndDate,
  isInGracePeriod,
} from '@/features/grace/utils/gracePeriod'
import {
  formatDashboardDate,
  getDaysUntil,
  isExpiringSoon,
  NON_EXPIRING_DATE_LABEL,
  toDateFromSeconds,
} from './utils'

export type SortField = 'name' | 'created' | 'expiry'
export type SortDir = 'asc' | 'desc'
type ExpiryCta = 'renew' | 'remindMe'
export type DashboardNameRole = 'owner' | 'manager'
export type DashboardNameProtocol = 'v1' | 'v2'

/** One name related to the connected addresses, as the dashboard lists it. */
export type DashboardName = {
  /** The row's namehash: stable across the addresses that list it. */
  readonly key: string
  /** ENSIP-15 normalized name. */
  readonly name: string
  readonly protocol: DashboardNameProtocol
  /** Seconds since the epoch; `0` = does not expire, `null` = unknown. */
  readonly expiryDate: number | null
  /** Seconds since the epoch the name was first observed, or `null`. */
  readonly createdAt: number | null
  readonly nameRoles: readonly DashboardNameRole[]
}

const RENEW_CTA_THRESHOLD_DAYS = 7

/**
 * bigname lists every name with a current relation, including ENSv2 rows past
 * their grace period. Released and unregistered rows have no current holder,
 * so they are not names the address holds.
 */
const LISTED_REGISTRATION_STATUSES: ReadonlySet<RegistrationStatus> = new Set([
  'active',
  'wrapped',
  'registered',
])

export const isListedAddressName = (row: AddressNameRow): boolean =>
  row.registration_status === undefined ||
  LISTED_REGISTRATION_STATUSES.has(row.registration_status)

/** `ens_v0` is an ENSv1 name still read from the 2017 registry. */
export const protocolForAuthority = (
  authority: Authority | undefined,
): DashboardNameProtocol => (authority === 'ens_v2' ? 'v2' : 'v1')

/**
 * bigname omits `expires_at` both for a name that never expires (a subname
 * whose parent set none, ENSv2 max expiry) and for an out-of-range value. A
 * held name without one is rendered as not expiring, like the `0` the indexer
 * used to send.
 */
export const addressNameExpirySeconds = (row: {
  readonly expires_at?: string
  readonly registration_status?: RegistrationStatus
}): number | null => {
  const seconds = timestampToSeconds(row.expires_at)
  if (seconds !== undefined) return seconds
  if (
    row.registration_status !== undefined &&
    LISTED_REGISTRATION_STATUSES.has(row.registration_status)
  ) {
    return 0
  }
  return null
}

/**
 * Chips for a row: `owner` for the token holder or registrant, `manager` for
 * the effective controller. ENSv2 names also count any registry grant the
 * addresses hold, as the Panoptes role bitmap did. An empty `role_summary` is
 * not proof that no grant exists (it can be partial), so it never removes a
 * chip `relations` supplies.
 */
export const getAddressNameRoles = (
  row: Pick<AddressNameRow, 'relations' | 'role_summary' | 'authority'>,
  addresses: readonly string[],
): readonly DashboardNameRole[] => {
  const relations = new Set(row.relations)
  const isOwner = relations.has('owner') || relations.has('registrant')
  const hasV2Grant =
    row.authority === 'ens_v2' &&
    addresses.some((address) => hasAnyGrant(row.role_summary, address))
  const isManager = relations.has('manager') || hasV2Grant

  const roles: DashboardNameRole[] = []
  if (isOwner) roles.push('owner')
  if (isManager) roles.push('manager')
  return roles
}

export const toDashboardName = (
  row: AddressNameRow,
  addresses: readonly string[],
): DashboardName => ({
  key: row.namehash,
  name: row.name,
  protocol: protocolForAuthority(row.authority),
  expiryDate: addressNameExpirySeconds(row),
  createdAt: timestampToSeconds(row.created_at) ?? null,
  nameRoles: getAddressNameRoles(row, addresses),
})

/**
 * Rows for the same name from several addresses (EOA, smart account, owner)
 * collapse into one: relations, grants and the primary flag are unioned.
 */
export const mergeAddressNameRows = (
  rows: readonly AddressNameRow[],
): AddressNameRow[] => {
  const byNamehash = new Map<string, AddressNameRow>()
  for (const row of rows) {
    const existing = byNamehash.get(row.namehash)
    if (!existing) {
      byNamehash.set(row.namehash, row)
      continue
    }
    byNamehash.set(row.namehash, {
      ...existing,
      relations: [...new Set([...existing.relations, ...row.relations])],
      is_primary: existing.is_primary || row.is_primary,
      role_summary: [
        ...(existing.role_summary ?? []),
        ...(row.role_summary ?? []),
      ],
    })
  }
  return [...byNamehash.values()]
}

const getExpirySortValue = (expirySeconds: number | null): number | null =>
  expirySeconds === 0 ? null : expirySeconds

export const compareDashboardNames = (
  a: DashboardName,
  b: DashboardName,
  field: SortField,
  dir: SortDir,
): number => {
  const mul = dir === 'asc' ? 1 : -1
  if (field === 'name') {
    return a.name.localeCompare(b.name) * mul
  }
  const ax =
    field === 'created' ? a.createdAt : getExpirySortValue(a.expiryDate)
  const bx =
    field === 'created' ? b.createdAt : getExpirySortValue(b.expiryDate)
  if (ax === null && bx === null) return 0
  if (ax === null) return 1
  if (bx === null) return -1
  return (ax - bx) * mul
}

/** Substring search stays client-side: bigname's `q` is prefix-only. */
export const filterAndSortDashboardNames = (params: {
  readonly names: readonly DashboardName[]
  readonly searchQuery: string
  readonly sortField: SortField
  readonly sortDir: SortDir
}): DashboardName[] => {
  const { names, searchQuery, sortField, sortDir } = params
  const q = searchQuery.trim().toLowerCase()
  return names
    .filter((name) => !q || name.name.toLowerCase().includes(q))
    .sort((a, b) => compareDashboardNames(a, b, sortField, sortDir))
}

export type DashboardRowMetadata = {
  readonly label: string
  readonly expiryDate: Date | null
  readonly displayExpiryDate: Date | null
  readonly graceEndDate: Date | null
  readonly daysUntilExpiry: number | null
  readonly daysSinceExpiry: number | null
  readonly expiringSoon: boolean
  readonly formattedExpiryDate: string
  readonly isV1: boolean
  readonly isPrimary: boolean
  readonly isInGrace: boolean
  readonly showProminentRenew: boolean
  readonly expiryCta: ExpiryCta | null
  readonly isMigrationEligible: boolean
}

/** Only ENSv2 names are renewed from the dashboard. */
const getExpiryCta = ({
  protocol,
  isInGrace,
  expiringSoon,
  daysUntilExpiry,
}: {
  readonly protocol: DashboardNameProtocol
  readonly isInGrace: boolean
  readonly expiringSoon: boolean
  readonly daysUntilExpiry: number | null
}): ExpiryCta | null => {
  if (protocol !== 'v2') return null
  if (isInGrace) return 'renew'
  if (!expiringSoon || daysUntilExpiry === null) return null
  return daysUntilExpiry <= RENEW_CTA_THRESHOLD_DAYS ? 'renew' : 'remindMe'
}

export const dashboardRowMetadata = (
  name: DashboardName,
  {
    primaryLabel,
    isMigrationEligible = false,
    now = new Date(),
  }: {
    readonly primaryLabel?: string | null
    readonly isMigrationEligible?: boolean
    readonly now?: Date
  } = {},
): DashboardRowMetadata => {
  const label = name.name
  const expiryDate =
    name.expiryDate === 0 ? null : toDateFromSeconds(name.expiryDate)
  const isV1 = name.protocol === 'v1'
  const protocol = name.protocol
  const isInGrace = isInGracePeriod(expiryDate, protocol, now)
  const graceEndDate =
    expiryDate && isInGrace ? getGraceEndDate(expiryDate, protocol) : null
  const displayExpiryDate = getDisplayExpiryDate(expiryDate, protocol, now)
  const daysUntilExpiry = getDaysUntil(expiryDate)
  const daysSinceExpiry =
    expiryDate && isInGrace ? getDaysSinceExpiry(expiryDate, now) : null
  const expiringSoon = isExpiringSoon(expiryDate, 30, daysUntilExpiry)
  const expiryCta = getExpiryCta({
    protocol,
    isInGrace,
    expiringSoon,
    daysUntilExpiry,
  })
  const isPrimary =
    !isV1 &&
    !!primaryLabel &&
    label.toLowerCase() === primaryLabel.toLowerCase()

  return {
    label,
    expiryDate,
    displayExpiryDate,
    graceEndDate,
    daysUntilExpiry,
    daysSinceExpiry,
    expiringSoon,
    formattedExpiryDate:
      name.expiryDate === 0
        ? NON_EXPIRING_DATE_LABEL
        : formatDashboardDate(displayExpiryDate),
    isV1,
    isPrimary,
    isInGrace,
    showProminentRenew: expiryCta === 'renew',
    expiryCta,
    isMigrationEligible: isV1 && isMigrationEligible,
  }
}
