export type CommemorativeNftFlowStatusInput = {
  readonly eligibilityStatus:
    | 'pending'
    | 'error'
    | 'eligible'
    | 'ineligible'
    | 'unavailable'
  readonly claimed: boolean | undefined
  readonly revealComplete: boolean
  readonly claimPending: boolean
  readonly claimError: boolean
}

export type CommemorativeNftFlowStatus =
  | 'loadingEligibility'
  | 'ineligible'
  | 'revealing'
  | 'readyToMint'
  | 'minting'
  | 'minted'
  | 'eligibilityError'
  | 'configurationError'
  | 'claimError'

export const getCommemorativeNftClaimedStatus = (params: {
  readonly preview: boolean
  readonly claimed: boolean | undefined
  readonly isFresh: boolean
}): boolean | undefined => {
  if (params.preview) return false
  if (params.claimed === true) return true
  return params.isFresh ? params.claimed : undefined
}

export const isCommemorativeNftClaimResultFresh = (params: {
  readonly isFetchedAfterMount: boolean
  readonly isSuccess: boolean
  readonly fetchStatus: 'fetching' | 'paused' | 'idle'
}): boolean =>
  params.isFetchedAfterMount &&
  params.isSuccess &&
  params.fetchStatus === 'idle'

export type CommemorativeNftAdmission =
  | { readonly status: 'checking' }
  | { readonly status: 'admitted' }
  | { readonly status: 'alreadyMinted' }
  | { readonly status: 'fallback' }
  | {
      readonly status: 'unavailable'
      readonly reason: 'ownerMissing' | 'claimReadFailed' | 'offline'
    }

export const getCommemorativeNftAdmission = (params: {
  readonly admitted: boolean
  readonly preview: boolean
  readonly hasOwner: boolean
  readonly supported: boolean
  readonly eligibilityStatus: CommemorativeNftFlowStatusInput['eligibilityStatus']
  readonly claimed: boolean | undefined
  readonly isFresh: boolean
  readonly claimReadError: boolean
  readonly fetchStatus: 'fetching' | 'paused' | 'idle'
}): CommemorativeNftAdmission => {
  if (params.preview || params.admitted) return { status: 'admitted' }
  if (!params.hasOwner) {
    return { status: 'unavailable', reason: 'ownerMissing' }
  }
  if (params.claimed === true) return { status: 'alreadyMinted' }
  if (!params.supported) return { status: 'fallback' }
  if (
    params.eligibilityStatus === 'ineligible' ||
    params.eligibilityStatus === 'unavailable'
  ) {
    return { status: 'fallback' }
  }
  if (params.fetchStatus === 'paused') {
    return { status: 'unavailable', reason: 'offline' }
  }
  if (params.claimReadError && params.fetchStatus === 'idle') {
    return { status: 'unavailable', reason: 'claimReadFailed' }
  }
  if (params.claimed === false && params.isFresh) return { status: 'admitted' }
  return { status: 'checking' }
}

export const getCommemorativeNftSessionKey = (params: {
  readonly chainId: number
  readonly ownerAddress: string | undefined
  readonly walletAddress: string | undefined
  readonly preview?: boolean
  readonly previewProfileName?: string
}): string =>
  JSON.stringify([
    params.chainId,
    params.ownerAddress?.toLowerCase(),
    params.walletAddress?.toLowerCase(),
    params.preview === true,
    params.preview ? params.previewProfileName : undefined,
  ])

export const getCommemorativeNftFlowStatus = (
  input: CommemorativeNftFlowStatusInput,
): CommemorativeNftFlowStatus => {
  if (input.eligibilityStatus === 'pending') return 'loadingEligibility'
  if (input.eligibilityStatus === 'error') return 'eligibilityError'
  if (input.eligibilityStatus === 'ineligible') return 'ineligible'
  if (input.eligibilityStatus === 'unavailable') return 'configurationError'
  if (input.claimed === true) return 'minted'
  if (input.claimError) return 'claimError'
  if (input.claimPending) return 'minting'
  if (input.claimed === undefined) return 'loadingEligibility'
  if (!input.revealComplete) return 'revealing'
  return 'readyToMint'
}
