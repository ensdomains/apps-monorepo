import type { RowSelectionState } from '@tanstack/react-table'
import type { NameRow } from '@/features/names/components/NamesTable/columns'
import type { SelectedName } from '@/features/renew/hooks/useRenewalTransactions'

export const MS_PER_SECOND = 1000
export const MS_PER_DAY = 24 * 60 * 60 * MS_PER_SECOND
export const GRACE_PERIOD_DAYS = 90
export const V2_GRACE_PERIOD_DAYS = 28
export const PREMIUM_PERIOD_DAYS = 21

export const getSelectedNames = (
  rowSelection: RowSelectionState,
  filteredData: NameRow[],
): readonly SelectedName[] =>
  Object.keys(rowSelection)
    .map((idx) => filteredData[Number(idx)])
    .filter((row): row is NameRow => Boolean(row))
    .filter((row): row is NameRow & { name: string } => row.name !== null)
    .map((row) => ({
      name: row.name,
      isV2: row.protocolVersion === 'ENSv2',
      expiryDate: row.expiryDate,
    }))

export const getNameStatus = (
  expiryDate: Date | null | undefined,
  isV2 = false,
): string => {
  if (!expiryDate) return 'no-expiry'
  const now = new Date()
  const graceDays = isV2 ? V2_GRACE_PERIOD_DAYS : GRACE_PERIOD_DAYS
  const gracePeriodEnd = new Date(expiryDate.getTime() + graceDays * MS_PER_DAY)
  if (isV2) {
    if (now > gracePeriodEnd) return 'expired'
    if (now > expiryDate) return 'grace'
    return 'registered'
  }
  const premiumPeriodEnd = new Date(
    gracePeriodEnd.getTime() + PREMIUM_PERIOD_DAYS * MS_PER_DAY,
  )
  if (now > premiumPeriodEnd) return 'expired'
  if (now > gracePeriodEnd) return 'premium'
  if (now > expiryDate) return 'grace'
  return 'registered'
}

export const getNameLength = (name: string | null): string => {
  if (!name) return '5+'
  const label = name.split('.')[0]
  if (label.length === 3) return '3'
  if (label.length === 4) return '4'
  return '5+'
}

// V2: ETHRegistrar.renew reverts once expiry <= now (no grace period).
// V1: ETHRegistrarController.renew reverts once past grace (in premium window).
export const isExtendable2LD = ({
  name,
  isV2,
  expiryDate,
}: SelectedName): boolean => {
  if (!/^[^.]+\.eth$/.test(name)) return false
  if (!expiryDate) return true
  const cutoff = isV2
    ? expiryDate.getTime()
    : expiryDate.getTime() + GRACE_PERIOD_DAYS * MS_PER_DAY
  return cutoff > Date.now()
}
