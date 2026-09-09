import type { Address } from 'viem'
import type {
  CommemorativeNftEligibility,
  CommemorativeNftEligibilityResult,
} from './types'

export const getVisibleCommemorativeNftEligibility = (params: {
  readonly featureEnabled: boolean
  readonly ownerAddress: Address | undefined
  readonly supported: boolean
  readonly result: CommemorativeNftEligibilityResult | undefined
  readonly hasFreshEligibilityResult: boolean
  readonly minted: boolean
}): CommemorativeNftEligibility | undefined => {
  if (
    !params.featureEnabled ||
    !params.ownerAddress ||
    !params.supported ||
    params.result?.status !== 'eligible' ||
    (!params.hasFreshEligibilityResult && !params.minted)
  )
    return undefined

  const eligibility = params.result.eligibility
  if (
    eligibility.source !== 'static' ||
    !eligibility.assets.metadataUrl ||
    eligibility.proof.length === 0 ||
    eligibility.ownerAddress.toLowerCase() !== params.ownerAddress.toLowerCase()
  )
    return undefined

  return eligibility
}
