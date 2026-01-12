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

    // signer.account is a KernelAccountClient from @zerodev/sdk
    const kernelClient = signer.account as any
    if (kernelClient?.account?.address) {
      return kernelClient.account.address as Address
    }
    // Fallback: try to get address directly if it's a string
    if (typeof kernelClient?.address === 'string') {
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
