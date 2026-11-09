import {
  getPaletteWorkflowReadiness,
  type PaletteHandoffReadiness,
} from '@/features/command-palette/handoff'
import { isRegistrable } from '@/utils/ens/tldHelpers'
import { isCanonicalName } from '@/utils/token/isNormalized'

export const isSupportedRenewalTarget = (name: string) =>
  isRegistrable(name) && isCanonicalName(name)

export const getRenewalPaletteState = ({
  name,
  isChecking,
  canExtend,
  hasCheckError,
  isOperationInFlight,
  activeTransactionId,
  transactionIds,
}: {
  readonly name: string
  readonly isChecking: boolean
  readonly canExtend: boolean
  readonly hasCheckError: boolean
  readonly isOperationInFlight: boolean
  readonly activeTransactionId?: string
  readonly transactionIds: readonly string[]
}) => ({
  canViewActiveOperation:
    canExtend &&
    isOperationInFlight &&
    activeTransactionId !== undefined &&
    transactionIds.includes(activeTransactionId),
  readiness: isOperationInFlight
    ? {
        reason: `Another operation is already in progress. Open its original page to view progress, then try renewing ${name} again.`,
      }
    : getPaletteWorkflowReadiness({
        isChecking,
        canOpen: canExtend,
        blockedReason: `${name} cannot be renewed here right now.`,
        failureReason: hasCheckError
          ? `Could not check renewal for ${name}. Refresh and try again.`
          : null,
      }),
})

export const getRenewalGateReadiness = ({
  name,
  ownerStatus,
  eligibility,
  hasResolverError,
}: {
  readonly name: string
  readonly ownerStatus: 'pending' | 'error' | 'success'
  readonly eligibility: {
    readonly canExtend: boolean
    readonly isChecking: boolean
    readonly hasCheckError: boolean
  }
  readonly hasResolverError: boolean
}): PaletteHandoffReadiness => {
  const failureReason =
    hasResolverError || ownerStatus === 'error' || eligibility.hasCheckError
      ? `Could not check renewal for ${name}. Refresh the name and try again.`
      : null
  if (eligibility.canExtend && failureReason === null) return 'checking'
  return getPaletteWorkflowReadiness({
    isChecking:
      isSupportedRenewalTarget(name) &&
      (ownerStatus === 'pending' || eligibility.isChecking),
    canOpen: false,
    blockedReason: `${name} cannot be renewed here right now.`,
    failureReason,
  })
}
