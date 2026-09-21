import type { Config as WagmiConfig } from '@wagmi/core'
import type { Address, Hex } from 'viem'
import { withNftClaimSubmissionLock } from './claimSubmissionLock'
import {
  CommemorativeNftClaimError,
  claimCommemorativeNft,
  encodeCommemorativeNftClaim,
  readCommemorativeNftClaimed,
  waitForCommemorativeNftClaimReceipt,
} from './contract'
import { trackNftEvent } from './diagnostics'
import {
  assertPendingNftClaimStorageReady,
  clearPendingNftClaim,
  type PendingNftClaim,
  type PendingNftClaimScope,
  readPendingNftClaim,
  savePendingNftClaim,
} from './pendingClaim'
import type { CommemorativeNftEligibility } from './types'

const requireStorage = (scope: PendingNftClaimScope): void => {
  try {
    assertPendingNftClaimStorageReady(scope)
  } catch {
    throw new CommemorativeNftClaimError(
      'storage-unavailable',
      'Recovery storage is unavailable',
    )
  }
}
const keepSubmittedClaim = (
  claim: PendingNftClaim,
  previousHash = claim.hash,
): void => {
  try {
    savePendingNftClaim(claim, { previousHash })
  } catch {
    /* Keep following the broadcast hash retained by the store in memory. */
  }
}

export const submitPendingNftClaim = async (params: {
  readonly wagmiConfig: WagmiConfig
  readonly chainId: number
  readonly contractAddress: Address | undefined
  readonly ownerAddress: Address | undefined
  readonly walletAddress: Address | undefined
  readonly eligibility: CommemorativeNftEligibility | undefined
  readonly isCurrent: () => boolean
  readonly recheckMigration: () => Promise<boolean>
}): Promise<PendingNftClaim> => {
  const { ownerAddress, walletAddress, contractAddress, eligibility } = params
  if (
    !ownerAddress ||
    !walletAddress ||
    !contractAddress ||
    ownerAddress.toLowerCase() !== walletAddress.toLowerCase()
  )
    throw new CommemorativeNftClaimError(
      'wallet-mismatch',
      'Eligible owner wallet is not connected',
    )
  if (
    eligibility?.source !== 'static' ||
    eligibility.proof.length === 0 ||
    eligibility.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()
  )
    throw new CommemorativeNftClaimError(
      'invalid-proof',
      'Published eligibility is required',
    )
  const scope = { ownerAddress, chainId: params.chainId, contractAddress }
  return withNftClaimSubmissionLock(scope, async () => {
    if (!params.isCurrent())
      throw new CommemorativeNftClaimError(
        'feature-disabled',
        'NFT feature is unavailable',
      )
    requireStorage(scope)
    if (!(await params.recheckMigration()))
      throw new CommemorativeNftClaimError(
        'migration-incomplete',
        'Migration is incomplete',
      )
    if (!params.isCurrent())
      throw new CommemorativeNftClaimError(
        'feature-disabled',
        'NFT feature is unavailable',
      )
    if (
      await readCommemorativeNftClaimed({
        wagmiConfig: params.wagmiConfig,
        chainId: params.chainId,
        ownerAddress,
      })
    )
      throw new CommemorativeNftClaimError(
        'already-claimed',
        'NFT already claimed',
      )
    if (!params.isCurrent())
      throw new CommemorativeNftClaimError(
        'feature-disabled',
        'NFT feature is unavailable',
      )
    // Re-read after preflight: another tab could have submitted in the meantime.
    requireStorage(scope)
    const hash = await claimCommemorativeNft({
      wagmiConfig: params.wagmiConfig,
      chainId: params.chainId,
      ownerAddress,
      walletAddress,
      proof: eligibility.proof,
    })
    const claim: PendingNftClaim = {
      ...scope,
      version: 1,
      hash,
      expectedClaimData: encodeCommemorativeNftClaim(eligibility.proof),
      submittedAt: Date.now(),
    }
    keepSubmittedClaim(claim)
    trackNftEvent('nft:claim_outcome', { outcome: 'submitted' })
    return claim
  })
}

export const requireScopedPendingNftClaim = (params: {
  readonly claim: PendingNftClaim
  readonly chainId: number
  readonly ownerAddress: Address | undefined
  readonly contractAddress: Address | undefined
}): PendingNftClaim => {
  const { claim } = params
  const current = readPendingNftClaim(claim).claim
  if (
    !current ||
    current.hash !== claim.hash ||
    claim.chainId !== params.chainId ||
    claim.ownerAddress.toLowerCase() !== params.ownerAddress?.toLowerCase() ||
    claim.contractAddress.toLowerCase() !==
      params.contractAddress?.toLowerCase()
  )
    throw new CommemorativeNftClaimError(
      'wallet-mismatch',
      'Claim scope changed',
    )
  return current
}

export const reconcilePendingNftClaim = async (params: {
  readonly wagmiConfig: WagmiConfig
  readonly claim: PendingNftClaim
  readonly onHash: (hash: Hex) => void
}) => {
  let claim = params.claim
  const outcome = await waitForCommemorativeNftClaimReceipt({
    wagmiConfig: params.wagmiConfig,
    pendingClaim: claim,
    onReplaced: (hash) => {
      const previousHash = claim.hash
      claim = { ...claim, hash }
      keepSubmittedClaim(claim, previousHash)
      params.onHash(hash)
    },
  })
  claim = { ...claim, hash: outcome.hash }
  if (outcome.status === 'pending') keepSubmittedClaim(claim)
  else {
    try {
      clearPendingNftClaim(claim)
    } catch {
      /* Safely reconcile a retained record again if removal fails. */
    }
  }
  trackNftEvent('nft:claim_outcome', {
    outcome: outcome.status === 'confirmed' ? 'minted' : outcome.status,
  })
  if (
    outcome.status === 'cancelled' ||
    outcome.status === 'replaced' ||
    outcome.status === 'reverted'
  )
    throw new CommemorativeNftClaimError(
      outcome.status,
      'Mint transaction did not complete',
    )
  return { claim, outcome }
}
