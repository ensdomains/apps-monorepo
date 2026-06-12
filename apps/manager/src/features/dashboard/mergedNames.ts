import type { DomainFragment } from '@ens-apps/indexer'
import {
  getDaysSinceExpiry,
  getDisplayExpiryDate,
  getGraceEndDate,
  isInGracePeriod,
  shouldShowProminentRenew,
} from '@/features/grace/utils/gracePeriod'
import type { ClassifiedName } from '@/features/migration/service/classifyNames'
import {
  formatDashboardDate,
  getDaysUntil,
  isExpiringSoon,
  resolveDomainLabel,
  toDateFromSeconds,
} from './utils'

export type MergedItem =
  | {
      readonly kind: 'v2'
      readonly key: string
      readonly sortName: string
      readonly sortExpiry: number | null
      readonly sortCreated: number | null
      readonly domain: DomainFragment
    }
  | {
      readonly kind: 'v1'
      readonly key: string
      readonly sortName: string
      readonly sortExpiry: number | null
      readonly sortCreated: number | null
      readonly classified: ClassifiedName
    }

export type SortField = 'name' | 'created' | 'expiry'
export type SortDir = 'asc' | 'desc'

export const v1ExpirySeconds = (classified: ClassifiedName): number | null => {
  const raw =
    classified.domain.registration?.expiryDate ??
    classified.domain.wrappedDomain?.expiryDate ??
    null
  if (raw === null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

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
  const ax = field === 'created' ? a.sortCreated : a.sortExpiry
  const bx = field === 'created' ? b.sortCreated : b.sortExpiry
  if (ax === null && bx === null) return 0
  if (ax === null) return 1
  if (bx === null) return -1
  return (ax - bx) * mul
}

export const buildMergedNamesList = (params: {
  v2Names: readonly DomainFragment[]
  v1Classified: readonly ClassifiedName[]
  searchQuery: string
  sortField: SortField
  sortDir: SortDir
}): MergedItem[] => {
  const { v2Names, v1Classified, searchQuery, sortField, sortDir } = params
  const q = searchQuery.trim().toLowerCase()
  const items: MergedItem[] = []

  for (const domain of v2Names) {
    const label = resolveDomainLabel(domain)
    if (q && !label.toLowerCase().includes(q)) continue
    items.push({
      kind: 'v2',
      key: `v2-${domain.id}`,
      sortName: label,
      sortExpiry: domain.expiryDate ?? null,
      sortCreated: domain.createdAt,
      domain,
    })
  }

  for (const classified of v1Classified) {
    const label = classified.domain.name
    if (
      q &&
      !label.toLowerCase().includes(q) &&
      !classified.label.toLowerCase().includes(q)
    ) {
      continue
    }
    items.push({
      kind: 'v1',
      key: `v1-${classified.domain.id}`,
      sortName: label,
      sortExpiry: v1ExpirySeconds(classified),
      sortCreated: null,
      classified,
    })
  }

  items.sort((a, b) => compareMerged(a, b, sortField, sortDir))
  return items
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
  readonly useDefaultAvatar: boolean
  readonly useWireframeNameplate: boolean
  readonly avatarUrl: string | undefined
}

export const mergedRowMetadata = (
  item: MergedItem,
  primaryLabel?: string | null,
  avatarOverride?: string,
  now: Date = new Date(),
): MergedRowMetadata => {
  const label = item.sortName
  const expiryDate = toDateFromSeconds(item.sortExpiry)
  const isV1 = item.kind === 'v1'
  const isV2 = !isV1
  const isInGrace = isInGracePeriod(expiryDate, isV2, now)
  const graceEndDate =
    expiryDate && isInGrace ? getGraceEndDate(expiryDate, isV2) : null
  const displayExpiryDate = getDisplayExpiryDate(expiryDate, isV2, now)
  const daysUntilExpiry = getDaysUntil(expiryDate)
  const daysSinceExpiry =
    expiryDate && isInGrace ? getDaysSinceExpiry(expiryDate, now) : null
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
    expiringSoon: isExpiringSoon(expiryDate, 30, daysUntilExpiry),
    formattedExpiryDate: formatDashboardDate(displayExpiryDate),
    isV1,
    isPrimary,
    isInGrace,
    showProminentRenew: shouldShowProminentRenew(expiryDate, isV2, now),
    useDefaultAvatar: isInGrace,
    useWireframeNameplate: isInGrace,
    avatarUrl,
  }
}
