/**
 * HCA Registry Utilities
 *
 * Functions to register and query Hidden Contract Account (HCA) ownership.
 * The HCA registry maps smart account addresses to their EOA owners, allowing
 * ENS names to be owned by the EOA even though the smart account registers them.
 */

import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager'
import type { Address, PublicClient, WalletClient } from 'viem'
import { customSepolia } from '@/lib/wagmi'
import { HCA_FACTORY_ABI } from '../hca-factory.abi'
import type { SmartAccountProvider } from './types'

/**
 * Register HCA ownership in the HCA factory registry
 *
 * This function registers that a smart account (HCA) is owned by an EOA.
 * After this registration, when ENS checks ownership, it will use the EOA
 * as the owner instead of the smart account address.
 *
 * @param params - Registration parameters
 * @returns Transaction hash
 * @throws Error if registration fails
 */
export async function registerHCAOwnership(params: {
  smartAccountAddress: Address
  eoaAddress: Address
  walletClient: WalletClient
  publicClient: PublicClient
}): Promise<`0x${string}`> {
  const { smartAccountAddress, eoaAddress, walletClient, publicClient } = params

  console.log('🔐 Registering HCA ownership:', {
    smartAccount: smartAccountAddress,
    eoaOwner: eoaAddress,
    hcaFactory: ENS_SEPOLIA_CONTRACTS.HCAFactory,
  })

  const currentOwner = await publicClient.readContract({
    address: ENS_SEPOLIA_CONTRACTS.HCAFactory,
    abi: HCA_FACTORY_ABI,
    functionName: 'getAccountOwner',
    args: [smartAccountAddress],
  })

  if (currentOwner.toLowerCase() === eoaAddress.toLowerCase()) {
    console.log('✅ HCA ownership already registered')
    return '0x0' as `0x${string}`
  }

  if (currentOwner !== '0x0000000000000000000000000000000000000000') {
    console.warn(
      '⚠️ HCA already has a different owner registered:',
      currentOwner,
    )
  }

  if (!walletClient.account) {
    throw new Error(
      'Wallet client must have an account to register HCA ownership',
    )
  }

  const hash = await walletClient.writeContract({
    account: walletClient.account,
    address: ENS_SEPOLIA_CONTRACTS.HCAFactory,
    abi: HCA_FACTORY_ABI,
    functionName: 'setAccountOwner',
    args: [smartAccountAddress, eoaAddress],
    chain: customSepolia,
  })

  console.log('✅ HCA ownership registration transaction sent:', hash)

  return hash
}

/**
 * Get the EOA owner of an HCA from the registry
 *
 * @param params - Query parameters
 * @returns EOA address if registered, zero address otherwise
 */
export async function getHCAOwner(params: {
  smartAccountAddress: Address
  publicClient: PublicClient
}): Promise<Address> {
  const { smartAccountAddress, publicClient } = params

  const owner = await publicClient.readContract({
    address: ENS_SEPOLIA_CONTRACTS.HCAFactory,
    abi: HCA_FACTORY_ABI,
    functionName: 'getAccountOwner',
    args: [smartAccountAddress],
  })

  return owner
}

/**
 * Helper function to register HCA ownership with error handling
 *
 * This is a convenience wrapper around registerHCAOwnership that handles
 * logging and errors gracefully, allowing smart account initialization
 * to proceed even if HCA registration fails.
 *
 * @param params - Registration parameters
 * @param accountType - Optional account type/provider name for logging (e.g., 'Pimlico', 'Rhinestone')
 */
export async function registerHCAOwnershipSafe(params: {
  smartAccountAddress: Address
  eoaAddress: Address
  walletClient: WalletClient
  publicClient: PublicClient
  accountType?: SmartAccountProvider
}): Promise<void> {
  const { accountType = 'pimlico' } = params

  try {
    console.log(`🔐 Registering HCA ownership for ${accountType} account...`)
    await registerHCAOwnership({
      smartAccountAddress: params.smartAccountAddress,
      eoaAddress: params.eoaAddress,
      walletClient: params.walletClient,
      publicClient: params.publicClient,
    })
    console.log('✅ HCA ownership registered successfully')
  } catch (error) {
    console.error('⚠️ Failed to register HCA ownership:', error)
  }
}
