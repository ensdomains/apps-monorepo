import type { Address } from 'viem'
import type { Signer } from '../types/signer.types'

/**
 * Get the smart account address from a signer.
 *
 * Only Rhinestone signers carry a smart-account address; other signer
 * types throw.
 */
export function getSmartAccountAddress(signer: Signer): Address {
  if (signer.type === 'rhinestone') {
    if (signer.config.accountAddress) {
      return signer.config.accountAddress
    }
    return signer.account.getAddress() as Address
  }

  throw new Error('Only Rhinestone signer is supported for this operation')
}
