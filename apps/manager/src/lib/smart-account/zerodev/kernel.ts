/**
 * ZeroDev Account Initialization
 *
 * Creates a Kernel smart account using ZeroDev SDK with Pimlico bundler.
 * This is the base account setup - sessions are handled separately by session-manager.ts
 */

import { logger } from '@ens-apps/utils/logger'
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator'
import {
  createKernelAccount,
  createKernelAccountClient,
  type KernelAccountClient,
  type KernelValidator,
  toSigner,
} from '@zerodev/sdk'
import { KERNEL_V3_1 } from '@zerodev/sdk/constants'
import type { Signer as ZeroDevSDKSigner } from '@zerodev/sdk/types'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import type { Address, WalletClient } from 'viem'
import { http } from 'viem'
import { entryPoint07Address } from 'viem/account-abstraction'
import { customSepolia, publicClient } from '@/lib/wagmi'
import { registerHCAOwnership } from '../hca-registry'
import type { SmartAccountType } from '../types'

export interface ZeroDevConfig {
  chain: typeof customSepolia
  accountType: SmartAccountType
  kernelVersion: typeof KERNEL_V3_1
  pimlicoApiKey: string
}

export interface InitializeZeroDevParams {
  walletClient: WalletClient
  accountType?: SmartAccountType
}

export interface ZeroDevInitResult {
  client: KernelAccountClient
  address: Address
  config: ZeroDevConfig
  /** The ECDSA validator used by the kernel account - needed for session creation */
  ecdsaValidator: KernelValidator<'ECDSAValidator'>
}

/**
 * Initialize a ZeroDev smart account
 *
 * Uses Pimlico as bundler for UserOperation submission.
 * Creates a Kernel v3.1 account with ECDSA validator.
 *
 * @param params - Initialization parameters
 * @returns KernelAccountClient, address, and config
 * @throws Error if initialization fails
 */
export async function initializeZeroDevAccount(
  params: InitializeZeroDevParams,
): Promise<ZeroDevInitResult> {
  const { walletClient, accountType = 'simple' } = params

  const pimlicoApiKey = import.meta.env.VITE_PIMLICO_API_KEY
  if (!pimlicoApiKey) {
    throw new Error('Pimlico API key not configured in environment variables')
  }

  const PIMLICO_URL = `https://api.pimlico.io/v2/${customSepolia.id}/rpc?apikey=${pimlicoApiKey}`

  const entryPoint = {
    address: entryPoint07Address,
    version: '0.7' as const,
  }

  const account = walletClient.account
  if (!account) {
    throw new Error('Wallet client must have an account')
  }

  logger.info('🔧 [ZERODEV] Creating ECDSA validator for:', account.address)

  // Convert wallet client to ZeroDev Signer type
  // Type assertion is safe because we've validated account exists above
  const signer = await toSigner({ signer: walletClient as ZeroDevSDKSigner })

  // Create ECDSA validator from signer
  // This works with external wallets (MetaMask, etc.) that don't expose private keys
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion: KERNEL_V3_1,
  })

  logger.info('🔧 [ZERODEV] Creating kernel account...')

  // Create Kernel account with ECDSA validator
  const kernelAccount = await createKernelAccount(publicClient, {
    entryPoint,
    kernelVersion: KERNEL_V3_1,
    plugins: {
      sudo: ecdsaValidator,
    },
  })

  logger.info('✅ [ZERODEV] Kernel account created:', kernelAccount.address)

  // Create Pimlico client for gas estimation and paymaster
  const pimlicoClient = createPimlicoClient({
    transport: http(PIMLICO_URL),
    entryPoint,
  })

  // Create account client with Pimlico bundler
  const client = createKernelAccountClient({
    account: kernelAccount,
    chain: customSepolia,
    bundlerTransport: http(PIMLICO_URL),
    // Use Pimlico client for gas estimation (avoids zd_getUserOperationGasPrice error)
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast
      },
    },
    paymaster: pimlicoClient,
  })

  const accountAddress = kernelAccount.address
  const eoaAddress = account.address

  // Register HCA ownership if using HCA account type
  // This maps the smart account to its EOA owner in the HCA Factory
  // Required for HCAEquivalence to work (tokens + registrar see EOA as msg.sender)
  if (accountType === 'hca') {
    logger.info('🔧 [ZERODEV] Registering HCA ownership...')

    const zerodevSigner = {
      type: 'zerodev' as const,
      account: client as KernelAccountClient,
      config: {
        chain: customSepolia,
        accountAddress,
        accountType,
        pimlicoApiKey,
      },
    }

    const result = await registerHCAOwnership({
      smartAccountAddress: accountAddress,
      eoaAddress,
      signer: zerodevSigner,
      publicClient,
    })

    if (result.isErr()) {
      throw new Error(
        `HCA registration failed: ${result.error.reason} - ${JSON.stringify(result.error.details)}`,
      )
    }

    logger.info('✅ [ZERODEV] HCA registration result:', result.value)
  }

  const config: ZeroDevConfig = {
    chain: customSepolia,
    accountType,
    kernelVersion: KERNEL_V3_1,
    pimlicoApiKey,
  }

  return {
    client: client as KernelAccountClient,
    address: accountAddress,
    config,
    ecdsaValidator,
  }
}
