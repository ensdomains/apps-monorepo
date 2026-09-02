import { computeStandaloneHcaAddress } from '@ens-apps/smart-account'
import type { Address } from 'viem'

/**
 * Derives the migration HCA independently of the current smart-account feature
 * mode. In EOA-only builds the smart-account context aliases its account
 * address to the owner, but an older temporary grant still targets this HCA.
 */
export const deriveMigrationCleanupHcaAddress = (params: {
  readonly chainId: number | undefined
  readonly ownerAddress: Address | undefined
}): Address | undefined => {
  if (!params.chainId || !params.ownerAddress) return undefined
  try {
    return computeStandaloneHcaAddress({
      chainId: params.chainId,
      owner: params.ownerAddress,
    })
  } catch {
    // An unsupported chain has no trusted migration deployment to recover.
    return undefined
  }
}
