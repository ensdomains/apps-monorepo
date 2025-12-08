import type { Address } from 'viem'
import type { Signer } from '../types/signer.types'

/**
 * Get the smart account address from a signer
 */
export function getSmartAccountAddress(signer: Signer): Address {
  if (signer.type === 'rhinestone') {
    // Rhinestone SDK account - use getAddress method
    return signer.account.getAddress() as Address
  }

  if (signer.type === 'pimlico') {
    // First, try to get address from config if available
    if (signer.config.accountAddress) {
      return signer.config.accountAddress
    }

    // signer.account is a SmartAccountClient from permissionless
    // The SmartAccountClient has an account property with an address property
    const smartAccountClient = signer.account as any
    if (smartAccountClient?.account?.address) {
      return smartAccountClient.account.address as Address
    }
    // Fallback: try to get address directly if it's a string
    if (typeof smartAccountClient?.address === 'string') {
      return smartAccountClient.address as Address
    }
    throw new Error(
      'Unable to get smart account address from SmartAccountClient',
    )
  }

  throw new Error(
    'Only Rhinestone or Pimlico signer is supported for this operation',
  )
}
