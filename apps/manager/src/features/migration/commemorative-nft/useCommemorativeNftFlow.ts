import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Address, Hex } from 'viem'
import { useChainId, useConfig } from 'wagmi'
import type {
  CommemorativeNftCardData,
  MigrationSuccessDialogState,
} from '../components/success/MigrationSuccessDialog.types'
import { buildCommemorativeNftCardData } from './cardData'
import {
  getCommemorativeNftClaimMessage,
  getCommemorativeNftEligibilityMessage,
  getCommemorativeNftPendingMessage,
  getCommemorativeNftUnavailableMessage,
} from './claimMessages'
import {
  reconcilePendingNftClaim,
  requireScopedPendingNftClaim,
  submitPendingNftClaim,
} from './claimRecovery'
import { getCommemorativeNftContractAddress } from './config'
import {
  CommemorativeNftClaimError,
  decodeCommemorativeNftClaimError,
} from './contract'
import { trackNftEvent } from './diagnostics'
import {
  type CommemorativeNftAdmission,
  type CommemorativeNftFlowStatus,
  getCommemorativeNftAdmission,
  getCommemorativeNftClaimedStatus,
  getCommemorativeNftFlowStatus,
} from './flowState'
import {
  clearPendingNftClaim,
  type PendingNftClaim,
  type PendingNftClaimSnapshot,
  refreshPendingNftClaims,
} from './pendingClaim'
import {
  commemorativeNftClaimedQueryOptions,
  invalidateCommemorativeNftStatus,
} from './queries'
import { useCommemorativeNftOffer } from './useCommemorativeNftOffer'

type UseCommemorativeNftFlowOptions = {
  readonly open: boolean
  readonly ownerAddress: Address | undefined
  readonly walletAddress: Address | undefined
}

type ClaimAction =
  | { readonly kind: 'submit' }
  | { readonly kind: 'check'; readonly claim: PendingNftClaim }

type NftOffer = ReturnType<typeof useCommemorativeNftOffer>

const getEligibilityStatus = (
  offer: NftOffer,
  preserveClaim: boolean,
): Parameters<typeof getCommemorativeNftFlowStatus>[0]['eligibilityStatus'] => {
  const { availability, migrationCompletion, visibleEligibility } = offer
  if (
    !availability.featureEnabled ||
    !availability.supported ||
    (!preserveClaim && !availability.canCoordinateClaim)
  )
    return 'unavailable'
  if (availability.eligibility.data?.status === 'ineligible')
    return 'ineligible'
  if (availability.eligibility.isError) return 'error'
  if (!visibleEligibility) {
    if (availability.eligibility.data?.status === 'eligible')
      return availability.eligibility.isFetching ? 'pending' : 'unavailable'
    return availability.eligibility.data?.status ?? 'pending'
  }
  if (preserveClaim) return 'eligible'
  switch (migrationCompletion.status) {
    case 'complete':
      return 'eligible'
    case 'incomplete':
      return 'ineligible'
    case 'error':
    case 'reconciling':
      return 'error'
    default:
      return 'pending'
  }
}

const getAdmission = (params: {
  readonly offer: NftOffer
  readonly open: boolean
  readonly admitted: boolean
  readonly hasOwner: boolean
  readonly preserveClaim: boolean
  readonly eligibilityStatus: Parameters<
    typeof getCommemorativeNftFlowStatus
  >[0]['eligibilityStatus']
}): CommemorativeNftAdmission => {
  const { offer, eligibilityStatus } = params
  const { availability, migrationCompletion } = offer
  if (!availability.featureEnabled || !params.open)
    return { status: 'fallback' }
  if (offer.canRecoverClaim) return { status: 'admitted' }
  return getCommemorativeNftAdmission({
    admitted: params.admitted,
    hasOwner: params.hasOwner,
    supported: availability.supported,
    eligibilityStatus,
    claimed: availability.claimed.data,
    isFresh:
      availability.hasFreshClaimedResult &&
      ((availability.hasFreshEligibilityResult &&
        (migrationCompletion.isFreshComplete || params.preserveClaim)) ||
        eligibilityStatus === 'error'),
    claimReadError: availability.claimed.isError,
    fetchStatus: availability.claimed.fetchStatus,
  })
}

const getRecoveryDialogState = (params: {
  readonly pending: PendingNftClaimSnapshot
  readonly card?: CommemorativeNftCardData
  readonly claimed: boolean | undefined
  readonly checking: boolean
  readonly submitting: boolean
}): MigrationSuccessDialogState | undefined => {
  if (params.claimed === true) return undefined
  if (params.pending.claim) {
    if (params.submitting && params.card)
      return {
        status: 'minting',
        card: params.card,
        txHash: params.pending.claim.hash,
      }
    return {
      status: 'claimPending',
      card: params.card,
      txHash: params.pending.claim.hash,
      checking: params.checking,
      message: getCommemorativeNftPendingMessage(),
    }
  }
  if (params.pending.status === 'unavailable')
    return {
      status: 'error',
      stage: 'claim',
      card: params.card,
      message: getCommemorativeNftClaimMessage(
        new CommemorativeNftClaimError(
          'storage-unavailable',
          'Storage unavailable',
        ),
      ),
    }
  return undefined
}

const getDialogState = (params: {
  readonly flowStatus: CommemorativeNftFlowStatus
  readonly card?: CommemorativeNftCardData
  readonly txHash?: Hex
  readonly error: unknown
  readonly isReconciling: boolean
}): MigrationSuccessDialogState => {
  const { flowStatus, card, txHash } = params
  if (flowStatus === 'eligibilityError')
    return {
      status: 'error',
      stage: 'eligibility',
      message: getCommemorativeNftEligibilityMessage(params.isReconciling),
    }
  if (flowStatus === 'configurationError')
    return {
      status: 'error',
      stage: 'configuration',
      message: getCommemorativeNftUnavailableMessage(),
    }
  if (flowStatus === 'claimError')
    return {
      status: 'error',
      stage: 'claim',
      card,
      message: getCommemorativeNftClaimMessage(params.error),
    }
  if (flowStatus === 'ineligible') return { status: 'ineligible' }
  if (!card) return { status: 'loadingEligibility' }
  switch (flowStatus) {
    case 'readyToMint':
      return { status: 'readyToMint', card }
    case 'minting':
      return { status: 'minting', card, txHash }
    case 'minted':
      return { status: 'minted', card }
    default:
      return { status: 'loadingEligibility' }
  }
}

const isOwnerWallet = (
  ownerAddress: Address | undefined,
  walletAddress: Address | undefined,
): boolean =>
  !!ownerAddress &&
  !!walletAddress &&
  ownerAddress.toLowerCase() === walletAddress.toLowerCase()

export const useCommemorativeNftFlow = ({
  open,
  ownerAddress,
  walletAddress,
}: UseCommemorativeNftFlowOptions) => {
  const wagmiConfig = useConfig()
  const chainId = useChainId()
  const queryClient = useQueryClient()
  const contractAddress = getCommemorativeNftContractAddress(chainId)
  const mutationKey = qk('commemorative_nft', 'claim', {
    chainId,
    contractAddress: contractAddress?.toLowerCase(),
    ownerAddress: ownerAddress?.toLowerCase(),
  })
  const hasPendingMutation = useIsMutating({ mutationKey }) > 0
  const offer = useCommemorativeNftOffer({
    ownerAddress,
    enabled: open,
    pollClaimed: hasPendingMutation,
  })
  const { availability, migrationCompletion } = offer
  const eligibility = offer.visibleEligibility
  const pending = offer.pendingClaim
  const [admitted, setAdmitted] = useState(false)
  const [txHash, setTxHash] = useState<Hex | undefined>()
  const claimInFlight = useRef(false)
  const attemptedRecovery = useRef<string | undefined>(undefined)
  const scopeKey = JSON.stringify([
    chainId,
    contractAddress?.toLowerCase(),
    ownerAddress?.toLowerCase(),
    walletAddress?.toLowerCase(),
  ])
  const activeScope = useRef({
    key: scopeKey,
    enabled: availability.featureEnabled && open,
  })
  activeScope.current = {
    key: scopeKey,
    enabled: availability.featureEnabled && open,
  }
  useEffect(
    () => () => {
      activeScope.current.enabled = false
    },
    [],
  )

  const claimMutation = useMutation({
    mutationKey,
    mutationFn: async (action: ClaimAction) => {
      const isCurrent = () =>
        activeScope.current.enabled && activeScope.current.key === scopeKey
      if (!isCurrent())
        throw new CommemorativeNftClaimError(
          'feature-disabled',
          'NFT feature is unavailable',
        )
      const claim =
        action.kind === 'submit'
          ? await submitPendingNftClaim({
              wagmiConfig,
              chainId,
              ownerAddress,
              walletAddress,
              contractAddress,
              eligibility,
              isCurrent: () => isCurrent() && migrationCompletion.isCurrent(),
              recheckMigration: async () => {
                const result = await migrationCompletion.recheck()
                return result.isSuccess && result.data.isComplete
              },
            })
          : requireScopedPendingNftClaim({
              claim: action.claim,
              chainId,
              ownerAddress,
              contractAddress,
            })
      const onHash = (hash: Hex) => {
        attemptedRecovery.current = hash
        setTxHash(hash)
      }
      onHash(claim.hash)
      return reconcilePendingNftClaim({ wagmiConfig, claim, onHash })
    },
    onSuccess: async ({ claim, outcome }) => {
      if (outcome.status !== 'confirmed') return
      // This is a receipt-block hasClaimed read, not an optimistic mint flag.
      const queryKey = commemorativeNftClaimedQueryOptions({
        ownerAddress: claim.ownerAddress,
        chainId: claim.chainId,
        wagmiConfig,
      }).queryKey
      // Ignore a background unclaimed read that started before confirmation.
      await queryClient.cancelQueries({ queryKey, exact: true })
      queryClient.setQueryData(queryKey, true)
    },
    onError: async (error) => {
      trackNftEvent('nft:claim_outcome', { outcome: 'error' })
      if (
        decodeCommemorativeNftClaimError(error).reason === 'already-claimed' &&
        ownerAddress
      ) {
        await invalidateCommemorativeNftStatus({
          queryClient,
          ownerAddress,
          chainId,
        })
      }
    },
    onSettled: () => {
      claimInFlight.current = false
    },
  })

  // Restore only once per opening/hash. A timeout keeps the record and waits
  // for an explicit status check or a later focus, without endless polling.
  useEffect(() => {
    if (!open) {
      attemptedRecovery.current = undefined
      return
    }
    if (
      !availability.featureEnabled ||
      !availability.supported ||
      !pending.claim ||
      availability.claimed.data === true ||
      claimInFlight.current ||
      queryClient.isMutating({ mutationKey }) > 0 ||
      attemptedRecovery.current === pending.claim.hash
    )
      return
    attemptedRecovery.current = pending.claim.hash
    claimInFlight.current = true
    claimMutation.mutate({ kind: 'check', claim: pending.claim })
  }, [
    open,
    availability.featureEnabled,
    availability.supported,
    availability.claimed.data,
    pending.claim,
    claimMutation,
    mutationKey,
    queryClient,
  ])

  useEffect(() => {
    if (availability.claimed.data !== true || !pending.claim) return
    try {
      clearPendingNftClaim(pending.claim)
    } catch {
      /* Keep the recoverable record if storage is unavailable. */
    }
  }, [availability.claimed.data, pending.claim])

  const claimedStatus = getCommemorativeNftClaimedStatus({
    claimed: availability.claimed.data,
    isFresh: availability.hasFreshClaimedResult,
  })
  const isTrackingClaim =
    claimMutation.isPending || hasPendingMutation || !!pending.claim
  const preserveClaim = claimedStatus === true || isTrackingClaim
  const eligibilityStatus = getEligibilityStatus(offer, preserveClaim)
  const admission = getAdmission({
    offer,
    open,
    admitted,
    hasOwner: !!ownerAddress,
    preserveClaim,
    eligibilityStatus,
  })
  const isAdmitted = admission.status === 'admitted'
  useEffect(() => {
    if (!availability.featureEnabled) setAdmitted(false)
    else if (isAdmitted) setAdmitted(true)
  }, [availability.featureEnabled, isAdmitted])
  const flowStatus = getCommemorativeNftFlowStatus({
    eligibilityStatus,
    claimed: isAdmitted ? availability.claimed.data : claimedStatus,
    claimPending: isTrackingClaim,
    claimError: claimMutation.isError || availability.claimed.isError,
  })
  const card = useMemo<CommemorativeNftCardData | undefined>(
    () =>
      eligibility
        ? buildCommemorativeNftCardData({
            chainId,
            eligibility,
            minted: claimedStatus === true,
            ownerAddress: eligibility.ownerAddress,
          })
        : undefined,
    [chainId, eligibility, claimedStatus],
  )
  const checkingClaim = claimMutation.isPending || hasPendingMutation
  const canCheckStatus =
    offer.canRecoverClaim && !!pending.claim && !checkingClaim
  const checkStatus = useCallback(() => {
    if (
      !activeScope.current.enabled ||
      activeScope.current.key !== scopeKey ||
      !pending.claim ||
      claimInFlight.current ||
      queryClient.isMutating({ mutationKey }) > 0
    )
      return
    claimInFlight.current = true
    claimMutation.mutate({ kind: 'check', claim: pending.claim })
  }, [scopeKey, pending.claim, queryClient, mutationKey, claimMutation])
  useEffect(() => {
    if (!canCheckStatus) return
    const onFocus = () => {
      if (document.visibilityState === 'visible') checkStatus()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [canCheckStatus, checkStatus])

  const recoveryState = getRecoveryDialogState({
    pending,
    card,
    claimed: claimedStatus,
    checking: checkingClaim,
    submitting:
      claimMutation.isPending && claimMutation.variables.kind === 'submit',
  })
  const state = availability.featureEnabled
    ? (recoveryState ??
      getDialogState({
        flowStatus,
        card,
        txHash,
        error: claimMutation.error ?? availability.claimed.error,
        isReconciling: migrationCompletion.status === 'reconciling',
      }))
    : { status: 'loadingEligibility' as const }

  const retry = useCallback(() => {
    if (!activeScope.current.enabled || activeScope.current.key !== scopeKey)
      return
    refreshPendingNftClaims()
    if (!claimMutation.isPending && !pending.claim) {
      claimMutation.reset()
      setTxHash(undefined)
    }
    void Promise.allSettled([
      availability.eligibility.refetch(),
      availability.claimed.refetch(),
      migrationCompletion.recheck(),
    ])
  }, [
    scopeKey,
    claimMutation,
    pending.claim,
    availability.eligibility,
    availability.claimed,
    migrationCompletion.recheck,
  ])
  const canMint =
    isAdmitted &&
    flowStatus === 'readyToMint' &&
    offer.canSubmitMint &&
    isOwnerWallet(ownerAddress, walletAddress)
  const mint = useCallback(() => {
    if (
      !activeScope.current.enabled ||
      activeScope.current.key !== scopeKey ||
      !canMint ||
      claimInFlight.current ||
      queryClient.isMutating({ mutationKey }) > 0
    )
      return
    claimInFlight.current = true
    claimMutation.mutate({ kind: 'submit' })
  }, [scopeKey, canMint, claimMutation, mutationKey, queryClient])
  return {
    admission,
    state,
    eligibility,
    canMint,
    mint,
    retry,
    canCheckStatus,
    checkStatus,
  }
}
