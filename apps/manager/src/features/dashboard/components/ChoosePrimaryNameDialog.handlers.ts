/**
 * Pure helpers for the choose-primary-name dialog.
 *
 * Business logic kept outside the React component for testability.
 */

import type { ProfileRecordsResult } from '@/features/profile/service/profileRecords'

const ETH_COIN_TYPE = 60

export function getEthAddressFromRecords(
  records: ProfileRecordsResult | undefined,
): string | undefined {
  return records?.coins?.find((c) => c.coinType === ETH_COIN_TYPE)?.value
}

export function hasMatchingEthAddress(
  records: ProfileRecordsResult | undefined,
  walletAddress: string | undefined,
): boolean {
  if (!walletAddress) return false
  const ethAddress = getEthAddressFromRecords(records)
  if (!ethAddress) return false
  return ethAddress.toLowerCase() === walletAddress.toLowerCase()
}

/**
 * A forward write is needed: the name's ETH record does not already point at
 * the connected wallet. `recordsSettled` must come from the query's `isSuccess`
 * — a *failed* read leaves `data` undefined exactly as a pending one does, and
 * reading that as "no ETH record" sends the dialog down the resolver-setup
 * branch on nothing more than an RPC blip.
 */
export function shouldUpdateEthAddress({
  selectedName,
  recordsSettled,
  selectedNameRecords,
  ownerAddress,
}: {
  readonly selectedName: string | null
  readonly recordsSettled: boolean
  readonly selectedNameRecords: ProfileRecordsResult | undefined
  readonly ownerAddress?: string
}): boolean {
  return (
    Boolean(selectedName) &&
    recordsSettled &&
    !hasMatchingEthAddress(selectedNameRecords, ownerAddress)
  )
}

/**
 * Nothing to submit yet: a step is in flight, or a query the branch decision
 * depends on (resolver write access, records) has not produced an answer.
 */
export function isConfirmBlocked({
  isSubmitting,
  isPreparing,
  resolverAccessSettled,
  recordsSettled,
  hasChanges,
  selectedName,
}: {
  readonly isSubmitting: boolean
  readonly isPreparing: boolean
  readonly resolverAccessSettled: boolean
  readonly recordsSettled: boolean
  readonly hasChanges: boolean
  readonly selectedName: string | null
}): boolean {
  return (
    isSubmitting ||
    isPreparing ||
    !resolverAccessSettled ||
    !recordsSettled ||
    !hasChanges ||
    !selectedName
  )
}
