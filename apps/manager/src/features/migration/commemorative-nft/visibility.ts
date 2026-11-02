import { match } from 'ts-pattern'
import type { Address } from 'viem'
import type {
  CommemorativeNftEligibility,
  CommemorativeNftEligibilityResult,
} from './types'

/** Shared eligibility can prove incompletion, never permission to mint. */
export const getAutomaticNftCompletionMode = (params: {
  readonly isSameChain: boolean
  readonly isRecovering: boolean
  readonly isPending: boolean
  readonly isError: boolean
  readonly hasEligibleNames: boolean
}): 'wait' | 'known-incomplete' | 'verify' =>
  match(params)
    .with({ isSameChain: false }, () => 'verify' as const)
    .with({ isRecovering: true }, () => 'verify' as const)
    .with({ isPending: true }, () => 'wait' as const)
    .with(
      { isError: false, hasEligibleNames: true },
      () => 'known-incomplete' as const,
    )
    .otherwise(() => 'verify' as const)

export const getNftCompletionPresentation = (params: {
  readonly isEnabled: boolean
  readonly mode: ReturnType<typeof getAutomaticNftCompletionMode>
  readonly isFetchedAfterMount: boolean
  readonly completionUpdatedAt: number
  readonly eligibilityUpdatedAt: number
  readonly isError: boolean
  readonly isSuccess: boolean
  readonly isIdle: boolean
  readonly data?: {
    readonly isComplete: boolean
    readonly status: 'complete' | 'incomplete'
  }
}) => {
  const hasNewerVerification =
    params.mode === 'known-incomplete' &&
    params.completionUpdatedAt > params.eligibilityUpdatedAt
  const hasResolved =
    params.isEnabled &&
    params.isFetchedAfterMount &&
    (params.mode === 'verify' || hasNewerVerification)
  const isComplete = hasResolved && params.data?.isComplete === true
  const status = match(params)
    .with({ isEnabled: true, mode: 'wait' }, () => 'pending' as const)
    .with({ isEnabled: true, mode: 'known-incomplete' }, () =>
      hasResolved ? (params.data?.status ?? 'incomplete') : 'incomplete',
    )
    .with({ isError: true }, () => 'error' as const)
    .otherwise(() =>
      hasResolved ? (params.data?.status ?? 'pending') : 'pending',
    )
  return {
    isComplete,
    isFreshComplete: isComplete && params.isSuccess && params.isIdle,
    status,
  }
}

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
