/**
 * ZeroDev Account Initialization
 *
 * Creates a Kernel smart account using ZeroDev SDK with Pimlico bundler.
 * When VITE_PIMLICO_BUNDLER_URL is set, uses a local Alto bundler instead of
 * Pimlico cloud, enabling fully-local E2E testing on an Anvil fork.
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
import {
  getChainFeesForUserOp,
  getLocalBundlerTransport,
  getLocalPaymasterClient,
  getPimlicoBundlerUrl,
  isLocalBundler,
} from '../bundler-url'
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
  const useLocal = isLocalBundler()

  // When using a local bundler (Alto), no Pimlico API key is needed.
  const pimlicoApiKey = import.meta.env.VITE_PIMLICO_API_KEY ?? ''
  if (!useLocal && !pimlicoApiKey) {
    throw new Error('Pimlico API key not configured in environment variables')
  }

  const entryPoint = {
    address: entryPoint07Address,
    version: '0.7' as const,
  }

  const account = walletClient.account
  if (!account) {
    throw new Error('Wallet client must have an account')
  }

  logger.info('🔧 [ZERODEV] Creating ECDSA validator for:', account.address)
  if (useLocal) {
    logger.info(
      '🔧 [ZERODEV] Using local bundler (Alto) — Pimlico cloud bypassed',
    )
  }

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

  // ---------- bundler / paymaster / gas configuration ----------
  let client: KernelAccountClient

  if (useLocal) {
    // Local Alto bundler + optional mock paymaster
    const bundlerUrl = getPimlicoBundlerUrl()
    const localPaymaster = getLocalPaymasterClient()

    client = createKernelAccountClient({
      account: kernelAccount,
      chain: customSepolia,
      bundlerTransport: getLocalBundlerTransport(bundlerUrl),
      userOperation: {
        estimateFeesPerGas: async () => getChainFeesForUserOp(),
      },
      ...(localPaymaster ? { paymaster: localPaymaster } : {}),
    }) as KernelAccountClient
  } else {
    // Production: Pimlico cloud bundler + paymaster
    const PIMLICO_URL = getPimlicoBundlerUrl()
    const pimlicoClient = createPimlicoClient({
      transport: http(PIMLICO_URL),
      entryPoint,
    })

    client = createKernelAccountClient({
      account: kernelAccount,
      chain: customSepolia,
      bundlerTransport: http(PIMLICO_URL),
      userOperation: {
        estimateFeesPerGas: async () =>
          (await pimlicoClient.getUserOperationGasPrice()).fast,
      },
      paymaster: pimlicoClient,
    }) as KernelAccountClient
  }

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
