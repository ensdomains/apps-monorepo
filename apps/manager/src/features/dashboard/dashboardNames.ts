import {
  type AddressNameRow,
  type Authority,
  hasAnyGrant,
  isV2GraceName,
  type NameRowFields,
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
const ETH_2LD_PATTERN = /^[^.]+\.eth$/

/**
 * Current registrations plus renewable ENSv2 former-owner rows. Released
 * rows have no current owner or manager; only those still inside their
 * exclusive grace window belong here. Unregistered rows, including registry
 * children without a name row on v0.4.1, are not current registrations.
 */
const LISTED_REGISTRATION_STATUSES: ReadonlySet<
  NameRowFields['registration_status']
> = new Set(['active', 'wrapped', 'registered'])

export const isListedAddressName = (
  row: Pick<NameRowFields, 'registration_status'> & Partial<AddressNameRow>,
): boolean =>
  !row.name?.endsWith('.addr.reverse') &&
  (LISTED_REGISTRATION_STATUSES.has(row.registration_status) ||
    isV2GraceName(row))

/** `ens_v0` is an ENSv1 name still read from the 2017 registry. */
export const protocolForAuthority = (
  authority: Authority | undefined,
): DashboardNameProtocol => (authority === 'ens_v2' ? 'v2' : 'v1')

/**
 * The date a row "Expires", in seconds. An ENSv1 `.eth` 2LD expires with its
 * BaseRegistrar lease, `ens_v1.expires_at`: from the Universal Resolver
 * cutover the top-level `expires_at` of such a name is its ENSv2
 * reservation's (lease + 62 days), not the lease. Every other row (ENSv2
 * names, and ENSv1 subnames, whose `ens_v1.expires_at` is `null`) expires at
 * the top-level `expires_at`. A held row with no finite expiry (`null` with
 * `expires_at_reason`, or a value past the safe-integer range) does not
 * expire, rendered as `0` like the indexer used to send.
 */
export const addressNameExpirySeconds = (
  row: Pick<NameRowFields, 'expires_at' | 'registration_status' | 'ens_v1'>,
): number | null => {
  const seconds = timestampToSeconds(row.ens_v1?.expires_at ?? row.expires_at)
  if (seconds !== undefined) return seconds
  if (LISTED_REGISTRATION_STATUSES.has(row.registration_status)) return 0
  return null
}

/**
 * Chips for a row: `owner` for the token holder (bigname's `owner`: the
 * BaseRegistrar, NameWrapper or ENSv2 token holder, else the registry owner),
 * `manager` for the account that can change the registry record or holds an
 * ENSv2 registry role (`role_holder`). ENSv2 names also count any registry
 * grant the addresses hold in `role_summary`, as the Panoptes role bitmap
 * did. An empty `role_summary` is not proof that no grant exists (it can be
 * partial, or dropped on the 422 fallback), so it never removes a chip
 * `relations` supplies. A wrapped `.eth` 2LD in its registrar grace serves no
 * `manager`, so it shows Owner only.
 */
export const getAddressNameRoles = (
  row: Pick<AddressNameRow, 'relations' | 'role_summary' | 'authority'>,
  addresses: readonly string[],
): readonly DashboardNameRole[] => {
  const relations = new Set(row.relations)
  const isOwner = relations.has('owner')
  const hasV2Grant =
    row.authority === 'ens_v2' &&
    addresses.some((address) => hasAnyGrant(row.role_summary, address))
  const isManager =
    relations.has('manager') || relations.has('role_holder') || hasV2Grant

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
  // Only `.eth` 2LDs have a registrar grace: 90 days after the ENSv1 lease,
  // 28 after an ENSv2 expiry (bigname's `grace_ends_at`). A subname's grace
  // ends at its expiry.
  const hasRegistrarGrace = ETH_2LD_PATTERN.test(label)
  const isInGrace =
    hasRegistrarGrace && isInGracePeriod(expiryDate, protocol, now)
  const graceEndDate =
    expiryDate && isInGrace ? getGraceEndDate(expiryDate, protocol) : null
  const displayExpiryDate = hasRegistrarGrace
    ? getDisplayExpiryDate(expiryDate, protocol, now)
    : expiryDate
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
