import type { Address } from 'viem'
import { useCommemorativeNftAvailability } from './useCommemorativeNftAvailability'
import { useCommemorativeNftMigrationCompletion } from './useCommemorativeNftMigrationCompletion'
import { usePendingCommemorativeNftClaim } from './usePendingCommemorativeNftClaim'
import { getVisibleCommemorativeNftEligibility } from './visibility'

/** Keep presentation stable; require fresh checks only for actionable offers. */
export const useCommemorativeNftOffer = (params: {
  readonly ownerAddress: Address | undefined
  readonly enabled: boolean
  readonly pollClaimed?: boolean
}) => {
  const availability = useCommemorativeNftAvailability(params)
  const minted = availability.claimed.data === true
  const pendingClaim = usePendingCommemorativeNftClaim({
    ownerAddress: params.ownerAddress,
    chainId: availability.chainId,
  })
  const canRecoverClaim =
    params.enabled &&
    availability.featureEnabled &&
    availability.supported &&
    !!params.ownerAddress &&
    !minted &&
    pendingClaim.status !== 'empty'
  const visibleEligibility = getVisibleCommemorativeNftEligibility({
    featureEnabled: availability.featureEnabled,
    ownerAddress: params.enabled ? params.ownerAddress : undefined,
    supported: availability.supported,
    result: availability.eligibility.data,
    hasFreshEligibilityResult: availability.hasResolvedEligibility,
    minted,
  })
  // A metadata 404 or an already claimed NFT must not enumerate V1 names.
  const isCandidate =
    !!visibleEligibility &&
    availability.claimed.isFetchedAfterMount &&
    availability.claimed.data === false
  const migrationCompletion = useCommemorativeNftMigrationCompletion({
    ownerAddress: params.ownerAddress,
    enabled: params.enabled && isCandidate && pendingClaim.status === 'empty',
  })
  const canSubmitMint =
    pendingClaim.status === 'empty' &&
    isCandidate &&
    availability.hasFreshEligibilityResult &&
    availability.isConfirmedUnclaimed &&
    migrationCompletion.isFreshComplete
  const canReconcileMigration =
    isCandidate &&
    pendingClaim.status === 'empty' &&
    (migrationCompletion.status === 'reconciling' ||
      migrationCompletion.status === 'error')
  return {
    availability,
    migrationCompletion,
    visibleEligibility,
    isCandidate,
    minted,
    pendingClaim,
    canRecoverClaim,
    canReconcileMigration,
    canOpenMint: canRecoverClaim || canReconcileMigration || canSubmitMint,
    canSubmitMint,
  }
}
