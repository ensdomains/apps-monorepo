import type { CommemorativeNftEligibility } from './types'
import { useCommemorativeNftAvailability } from './useCommemorativeNftAvailability'
import { useVerifiedCommemorativeNftOwner } from './useVerifiedCommemorativeNftOwner'
import { getVisibleCommemorativeNftEligibility } from './visibility'

export const useVisibleCommemorativeNftStatus = ({
  enabled = true,
}: {
  readonly enabled?: boolean
} = {}) => {
  const verifiedOwner = useVerifiedCommemorativeNftOwner()
  const availability = useCommemorativeNftAvailability({
    ownerAddress: verifiedOwner,
    enabled,
  })

  const eligibility = getVisibleCommemorativeNftEligibility({
    featureEnabled: availability.featureEnabled,
    ownerAddress: enabled ? verifiedOwner : undefined,
    supported: availability.supported,
    result: availability.eligibility.data,
    hasFreshEligibilityResult: availability.hasResolvedEligibility,
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
