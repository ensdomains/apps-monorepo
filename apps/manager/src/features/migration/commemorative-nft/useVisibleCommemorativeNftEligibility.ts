import { useConnection } from 'wagmi'
import { useSmartAccountContext } from '@/lib/smart-account'
import { resolveVerifiedOwner } from '@/lib/smart-account/sessionGate'
import type { CommemorativeNftEligibility } from './types'
import { useCommemorativeNftAvailability } from './useCommemorativeNftAvailability'
import { getVisibleCommemorativeNftEligibility } from './visibility'

export const useVisibleCommemorativeNftStatus = ({
  enabled = true,
}: {
  readonly enabled?: boolean
} = {}) => {
  const { ownerAddress } = useSmartAccountContext()
  const { address: walletAddress, isConnected } = useConnection()
  const verifiedOwner =
    resolveVerifiedOwner(
      ownerAddress,
      isConnected ? walletAddress : undefined,
    ) ?? undefined
  const availability = useCommemorativeNftAvailability({
    ownerAddress: verifiedOwner,
    enabled,
  })

  const eligibility = getVisibleCommemorativeNftEligibility({
    featureEnabled: availability.featureEnabled,
    ownerAddress: enabled ? verifiedOwner : undefined,
    supported: availability.supported,
    result: availability.eligibility.data,
    hasFreshEligibilityResult: availability.hasFreshEligibilityResult,
    minted: availability.claimed.data === true,
  })

  return {
    eligibility,
    isConfirmedUnclaimed: availability.isConfirmedUnclaimed,
  }
}

export const useVisibleCommemorativeNftEligibility = (
  options: { readonly enabled?: boolean } = {},
): CommemorativeNftEligibility | undefined =>
  useVisibleCommemorativeNftStatus(options).eligibility
