import {
  getDaysSinceExpiry,
  getDisplayExpiryDate,
  getGraceEndDate,
  isInGracePeriod,
} from '@/features/grace/utils/gracePeriod'
import type { RenewalProtocol } from '@/features/renew/utils/renewalProtocol'
import type { DashboardName } from './dashboardNames'
import {
  formatDashboardDate,
  getDaysUntil,
  isExpiringSoon,
  NON_EXPIRING_DATE_LABEL,
  toDateFromSeconds,
} from './utils'

export type { DashboardName, DashboardNameRole } from './dashboardNames'

export type MergedItem = {
  readonly kind: RenewalProtocol
  readonly key: string
  readonly sortName: string
  readonly sortExpiry: bigint
  readonly sortCreated: bigint | null
  readonly name: DashboardName
  readonly isMigrationEligible: boolean
}

export type SortField = 'name' | 'created' | 'expiry'
export type NameVersion = 'v1' | 'v2'
export type SortDir = 'asc' | 'desc'
export type ExpiryCta = 'renew' | 'remindMe'

const RENEW_CTA_THRESHOLD_DAYS = 7

const getMergedExpiryDate = (expirySeconds: bigint): Date | null =>
  expirySeconds === 0n ? null : toDateFromSeconds(Number(expirySeconds))

const getExpirySortValue = (expirySeconds: bigint): bigint | null =>
  expirySeconds === 0n ? null : expirySeconds

const formatMergedExpiryDate = (
  displayExpiryDate: Date | null,
  expirySeconds: bigint,
): string =>
  expirySeconds === 0n
    ? NON_EXPIRING_DATE_LABEL
    : formatDashboardDate(displayExpiryDate)

export const compareMerged = (
  a: MergedItem,
  b: MergedItem,
  field: SortField,
  dir: SortDir,
): number => {
  const mul = dir === 'asc' ? 1 : -1
  if (field === 'name') {
    return a.sortName.localeCompare(b.sortName) * mul
  }
  const ax =
    field === 'created' ? a.sortCreated : getExpirySortValue(a.sortExpiry)
  const bx =
    field === 'created' ? b.sortCreated : getExpirySortValue(b.sortExpiry)
  if (ax === null && bx === null) return 0
  if (ax === null) return 1
  if (bx === null) return -1
  if (ax === bx) return 0
  return (ax < bx ? -1 : 1) * mul
}

const toMergedItem = (
  name: DashboardName,
  eligibleKeys: ReadonlySet<string>,
): MergedItem => ({
  kind: name.protocol,
  key: name.key,
  sortName: name.name,
  sortExpiry: name.expiryDate,
  sortCreated: name.createdAt,
  name,
  isMigrationEligible:
    name.protocol === 'v1' && eligibleKeys.has(name.key.toLowerCase()),
})

/** Substring search stays client-side: bigname's `q` is prefix-only. */
export const buildMergedNamesList = (params: {
  readonly names: readonly DashboardName[]
  readonly eligibleKeys?: ReadonlySet<string>
  readonly searchQuery: string
  readonly sortField: SortField
  readonly sortDir: SortDir
}): MergedItem[] => {
  const { names, searchQuery, sortField, sortDir } = params
  const eligibleKeys = params.eligibleKeys ?? new Set<string>()
  const q = searchQuery.trim().toLowerCase()
  return names
    .filter((name) => !q || name.name.toLowerCase().includes(q))
    .map((name) => toMergedItem(name, eligibleKeys))
    .sort((a, b) => compareMerged(a, b, sortField, sortDir))
}

export type MergedRowMetadata = {
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
  readonly useDefaultAvatar: boolean
  readonly avatarUrl: string | undefined
  readonly isMigrationEligible: boolean
}

export const mergedRowMetadata = (
  item: MergedItem,
  primaryLabel?: string | null,
  avatarOverride?: string,
  now: Date = new Date(),
): MergedRowMetadata => {
  const label = item.sortName
  const expiryDate = getMergedExpiryDate(item.sortExpiry)
  const isV1 = item.kind === 'v1'
  const protocol = item.kind
  const isInGrace = isInGracePeriod(expiryDate, protocol, now)
  const graceEndDate =
    expiryDate && isInGrace ? getGraceEndDate(expiryDate, protocol) : null
  const displayExpiryDate = getDisplayExpiryDate(expiryDate, protocol, now)
  const { isMigrationEligible } = item
  const daysUntilExpiry = getDaysUntil(expiryDate)
  const daysSinceExpiry =
    expiryDate && isInGrace ? getDaysSinceExpiry(expiryDate, now) : null
  const expiringSoon = isExpiringSoon(expiryDate, 30, daysUntilExpiry)
  const expiryCta =
    protocol === 'v2' && isInGrace
      ? 'renew'
      : protocol === 'v2' && expiringSoon && daysUntilExpiry !== null
        ? daysUntilExpiry <= RENEW_CTA_THRESHOLD_DAYS
          ? 'renew'
          : 'remindMe'
        : null
  const isPrimary =
    !isV1 &&
    !!primaryLabel &&
    label.toLowerCase() === primaryLabel.toLowerCase()
  const avatarUrl = isV1 || isInGrace ? undefined : avatarOverride

  return {
    label,
    expiryDate,
    displayExpiryDate,
    graceEndDate,
    daysUntilExpiry,
    daysSinceExpiry,
    expiringSoon,
    formattedExpiryDate: formatMergedExpiryDate(
      displayExpiryDate,
      item.sortExpiry,
    ),
    isV1,
    isPrimary,
    isInGrace,
    showProminentRenew: expiryCta === 'renew',
    expiryCta,
    useDefaultAvatar: isInGrace,
    avatarUrl,
    isMigrationEligible,
  }
}
