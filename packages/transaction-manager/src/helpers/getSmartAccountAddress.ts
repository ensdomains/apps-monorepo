import { type Address, isAddress } from 'viem'
import type { Signer } from '../types/signer.types'

/**
 * Type guard for kernel client with nested account.address structure
 */
function hasAccountAddress(
  client: unknown,
): client is { account: { address: Address } } {
  return (
    typeof client === 'object' &&
    client !== null &&
    'account' in client &&
    typeof client.account === 'object' &&
    client.account !== null &&
    'address' in client.account &&
    typeof client.account.address === 'string' &&
    isAddress(client.account.address)
  )
}

/**
 * Type guard for kernel client with direct address property
 */
function hasDirectAddress(client: unknown): client is { address: Address } {
  return (
    typeof client === 'object' &&
    client !== null &&
    'address' in client &&
    typeof client.address === 'string' &&
    isAddress(client.address)
  )
}

/**
 * Get the smart account address from a signer
 */
export function getSmartAccountAddress(signer: Signer): Address {
  if (signer.type === 'rhinestone') {
    if (signer.config.accountAddress) {
      return signer.config.accountAddress
    }
    return signer.account.getAddress() as Address
  }

  if (signer.type === 'zerodev') {
    // First, try to get address from config if available
    if (signer.config.accountAddress) {
      return signer.config.accountAddress
    }

    const kernelClient = signer.account

    // Check for nested account.address structure
    if (hasAccountAddress(kernelClient)) {
      return kernelClient.account.address
    }

    // Fallback: try to get address directly
    if (hasDirectAddress(kernelClient)) {
      return kernelClient.address
    }

    throw new Error(
      'Unable to get smart account address from KernelAccountClient',
    )
  }

  throw new Error(
    'Only Rhinestone or ZeroDev signer is supported for this operation',
  )
}
