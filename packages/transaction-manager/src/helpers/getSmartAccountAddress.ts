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

  if (signer.type === 'zerodev') {
    // First, try to get address from config if available
    if (signer.config.accountAddress) {
      return signer.config.accountAddress
    }

    const kernelClient = signer.account
    if (
      kernelClient &&
      typeof kernelClient === 'object' &&
      'account' in kernelClient &&
      kernelClient.account &&
      typeof kernelClient.account === 'object' &&
      'address' in kernelClient.account
    ) {
      return kernelClient.account.address as Address
    }
    // Fallback: try to get address directly if it's a string
    if (
      kernelClient &&
      typeof kernelClient === 'object' &&
      'address' in kernelClient &&
      typeof kernelClient.address === 'string'
    ) {
      return kernelClient.address as Address
    }
    throw new Error(
      'Unable to get smart account address from KernelAccountClient',
    )
  }

  throw new Error(
    'Only Rhinestone or ZeroDev signer is supported for this operation',
  )
}
