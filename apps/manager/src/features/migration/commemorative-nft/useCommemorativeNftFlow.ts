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
  claimCommemorativeNft,
  decodeCommemorativeNftClaimError,
  waitForCommemorativeNftClaimReceipt,
} from './contract'
import {
  type CommemorativeNftAdmission,
  type CommemorativeNftFlowStatus,
  getCommemorativeNftAdmission,
  getCommemorativeNftClaimedStatus,
  getCommemorativeNftFlowStatus,
} from './flowState'
import { invalidateCommemorativeNftStatus } from './queries'
import type {
  CommemorativeNftEligibility,
  CommemorativeNftEligibilityResult,
} from './types'
import { useCommemorativeNftAvailability } from './useCommemorativeNftAvailability'

type UseCommemorativeNftFlowOptions = {
  readonly open: boolean
  readonly ownerAddress: Address | undefined
  readonly walletAddress: Address | undefined
  readonly migratedNameCount: number
  readonly preview?: boolean
}

const getClaimErrorMessage = (error: unknown): string =>
  decodeCommemorativeNftClaimError(error).message

const getPublishedEligibility = (
  result: CommemorativeNftEligibilityResult | undefined,
  enabled: boolean,
): CommemorativeNftEligibility | undefined =>
  enabled &&
  result?.status === 'eligible' &&
  result.eligibility.source === 'static'
    ? result.eligibility
    : undefined

const getEligibilityFlowStatus = (params: {
  readonly available: boolean
  readonly isError: boolean
  readonly isPending: boolean
  readonly hasEligibility: boolean
  readonly dataStatus?: 'eligible' | 'ineligible' | 'unavailable'
}): 'pending' | 'error' | 'eligible' | 'ineligible' | 'unavailable' => {
  if (!params.available) return 'unavailable'
  if (params.dataStatus === 'ineligible') return 'ineligible'
  if (params.isError) return 'error'
  if (params.isPending && !params.hasEligibility) return 'pending'
  if (params.hasEligibility) return 'eligible'
  if (params.dataStatus === 'eligible') return 'unavailable'
  return params.dataStatus ?? 'pending'
}

const getNonArtworkDialogState = (params: {
  readonly flowStatus: CommemorativeNftFlowStatus
  readonly eligibilityError?: Error | null
  readonly claimError?: Error | null
  readonly card?: CommemorativeNftCardData
}): MigrationSuccessDialogState | undefined => {
  switch (params.flowStatus) {
    case 'loadingEligibility':
      return { status: 'loadingEligibility' }
    case 'ineligible':
      return { status: 'ineligible' }
    case 'eligibilityError':
      return {
        status: 'error',
        stage: 'eligibility',
        message:
          params.eligibilityError?.message ||
          'Eligibility could not be loaded. Please try again.',
      }
    case 'configurationError':
      return {
        status: 'error',
        stage: 'configuration',
        message: 'The commemorative NFT preview is not available yet.',
      }
    case 'claimError':
      return {
        status: 'error',
        stage: 'claim',
        message:
          params.claimError?.message || getClaimErrorMessage(params.claimError),
        card: params.card,
      }
    default:
      return undefined
  }
}

const getArtworkDialogState = (params: {
  readonly flowStatus: CommemorativeNftFlowStatus
  readonly card?: CommemorativeNftCardData
  readonly txHash?: Hex
}): MigrationSuccessDialogState => {
  if (!params.card) return { status: 'loadingEligibility' }

  switch (params.flowStatus) {
    case 'readyToMint':
      return { status: 'readyToMint', card: params.card }
    case 'minting':
      return { status: 'minting', card: params.card, txHash: params.txHash }
    case 'minted':
      return { status: 'minted', card: params.card }
    default:
      return { status: 'loadingEligibility' }
  }
}

export const useCommemorativeNftFlow = ({
  open,
  ownerAddress,
  walletAddress,
  migratedNameCount,
  preview = false,
}: UseCommemorativeNftFlowOptions) => {
  const wagmiConfig = useConfig()
  const chainId = useChainId()
  const queryClient = useQueryClient()
  const mutationKey = qk('commemorative_nft', 'claim', {
    chainId,
    ownerAddress: ownerAddress?.toLowerCase(),
  })
  const hasPendingClaim = useIsMutating({ mutationKey }) > 0
  const [admitted, setAdmitted] = useState(false)
  const [txHash, setTxHash] = useState<Hex | undefined>()
  const [awaitingClaim, setAwaitingClaim] = useState(false)
  const [migratedAt] = useState(() => new Date())
  const claimInFlight = useRef(false)
  const availability = useCommemorativeNftAvailability({
    ownerAddress,
    enabled: open,
    pollClaimed: awaitingClaim || hasPendingClaim,
  })
  const featureEnabled = availability.featureEnabled
  const featureEnabledRef = useRef(featureEnabled)
  const eligibility = getPublishedEligibility(
    availability.eligibility.data,
    featureEnabled,
  )

  useEffect(() => {
    featureEnabledRef.current = featureEnabled
    return () => {
      featureEnabledRef.current = false
    }
  }, [featureEnabled])

  useEffect(() => {
    if (availability.claimed.data === true) setAwaitingClaim(false)
  }, [availability.claimed.data])

  const claimMutation = useMutation({
    mutationKey,
    mutationFn: async () => {
      if (!featureEnabledRef.current) {
        throw new Error('The commemorative NFT feature is disabled.')
      }
      if (!eligibility || !ownerAddress || !walletAddress) {
        throw new Error('The eligible owner wallet is not connected.')
      }
      if (
        preview ||
        eligibility.source !== 'static' ||
        eligibility.proof.length === 0
      ) {
        throw new Error('This preview is display-only.')
      }

      const hash = await claimCommemorativeNft({
        wagmiConfig,
        chainId: availability.chainId,
        ownerAddress,
        walletAddress,
        proof: eligibility.proof,
      })
      setTxHash(hash)
      setAwaitingClaim(true)
      await waitForCommemorativeNftClaimReceipt({
        wagmiConfig,
        chainId: availability.chainId,
        hash,
      })
      return hash
    },
    onSuccess: async (hash) => {
      setTxHash(hash)
      setAwaitingClaim(true)
      if (!ownerAddress) return
      await invalidateCommemorativeNftStatus({
        queryClient,
        ownerAddress,
        chainId: availability.chainId,
      })
    },
    onError: async (error) => {
      const decoded = decodeCommemorativeNftClaimError(error)
      if (decoded.reason !== 'already-claimed' || !ownerAddress) {
        setAwaitingClaim(false)
        return
      }
      setAwaitingClaim(true)
      await invalidateCommemorativeNftStatus({
        queryClient,
        ownerAddress,
        chainId: availability.chainId,
      })
    },
    onSettled: () => {
      claimInFlight.current = false
    },
  })

  const claimedStatus = getCommemorativeNftClaimedStatus({
    preview,
    claimed: availability.claimed.data,
    isFresh: availability.hasFreshClaimedResult,
  })
  const claimed = claimedStatus === true

  const eligibilityStatus = getEligibilityFlowStatus({
    available: featureEnabled && (availability.supported || preview),
    isError: availability.eligibility.isError,
    isPending: availability.eligibility.isPending,
    hasEligibility: !!eligibility,
    dataStatus: availability.eligibility.data?.status,
  })
  const admission: CommemorativeNftAdmission = featureEnabled
    ? getCommemorativeNftAdmission({
        admitted,
        preview,
        hasOwner: !!ownerAddress,
        supported: availability.supported,
        eligibilityStatus,
        claimed: availability.claimed.data,
        // Admit only after published metadata validation, or to show a completed
        // eligibility error in the existing retry UI.
        isFresh:
          availability.hasFreshClaimedResult &&
          (availability.hasFreshEligibilityResult ||
            eligibilityStatus === 'error'),
        claimReadError: availability.claimed.isError,
        fetchStatus: availability.claimed.fetchStatus,
      })
    : { status: 'fallback' }
  const isAdmitted = admission.status === 'admitted'

  useEffect(() => {
    if (!featureEnabled) setAdmitted(false)
    else if (isAdmitted) setAdmitted(true)
  }, [featureEnabled, isAdmitted])

  const flowStatus = getCommemorativeNftFlowStatus({
    eligibilityStatus,
    // Keep admitted artwork visible during background reads. Only a fresh
    // unclaimed result below can enable the mint action.
    claimed: isAdmitted && !preview ? availability.claimed.data : claimedStatus,
    claimPending: claimMutation.isPending || awaitingClaim || hasPendingClaim,
    claimError:
      claimMutation.isError || (!preview && availability.claimed.isError),
  })
  const card = useMemo<CommemorativeNftCardData | undefined>(() => {
    if (!eligibility) return undefined

    return buildCommemorativeNftCardData({
      chainId: availability.chainId,
      eligibility,
      migratedAt,
      migratedNameCount,
      minted: claimed,
      ownerAddress: eligibility.ownerAddress,
    })
  }, [
    availability.chainId,
    claimed,
    eligibility,
    migratedAt,
    migratedNameCount,
  ])

  const state =
    getNonArtworkDialogState({
      flowStatus,
      eligibilityError: availability.eligibility.error,
      claimError:
        availability.claimed.error ||
        (claimMutation.error instanceof Error ? claimMutation.error : null),
      card,
    }) ?? getArtworkDialogState({ flowStatus, card, txHash })

  const retry = useCallback(() => {
    if (!featureEnabledRef.current) return
    if (!claimMutation.isPending && !awaitingClaim) {
      claimMutation.reset()
      setTxHash(undefined)
    }
    void Promise.allSettled([
      availability.eligibility.refetch(),
      availability.claimed.refetch(),
    ])
  }, [
    availability.claimed,
    availability.eligibility,
    awaitingClaim,
    claimMutation,
  ])
  const canMint =
    featureEnabled &&
    isAdmitted &&
    flowStatus === 'readyToMint' &&
    availability.hasFreshEligibilityResult &&
    claimedStatus === false &&
    !preview &&
    !!eligibility &&
    eligibility.source === 'static' &&
    eligibility.proof.length > 0 &&
    !!ownerAddress &&
    !!walletAddress &&
    ownerAddress.toLowerCase() === walletAddress.toLowerCase()
  const mint = useCallback(() => {
    if (
      !featureEnabledRef.current ||
      !canMint ||
      claimInFlight.current ||
      queryClient.isMutating({ mutationKey }) > 0
    ) {
      return
    }
    claimInFlight.current = true
    claimMutation.mutate()
  }, [canMint, claimMutation, mutationKey, queryClient])

  return {
    admission,
    state,
    eligibility,
    canMint,
    mint,
    retry,
  }
}
