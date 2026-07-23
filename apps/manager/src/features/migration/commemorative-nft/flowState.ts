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

export const getCommemorativeNftFlowStatus = (
  input: CommemorativeNftFlowStatusInput,
): CommemorativeNftFlowStatus => {
  if (input.eligibilityStatus === 'pending') return 'loadingEligibility'
  if (input.eligibilityStatus === 'error') return 'eligibilityError'
  if (input.eligibilityStatus === 'ineligible') return 'ineligible'
  if (input.eligibilityStatus === 'unavailable') return 'configurationError'
  if (!input.revealComplete) return 'revealing'
  if (input.claimed === true) return 'minted'
  if (input.claimError) return 'claimError'
  if (input.claimPending) return 'minting'
  if (input.claimed === undefined) return 'loadingEligibility'
  return 'readyToMint'
}
