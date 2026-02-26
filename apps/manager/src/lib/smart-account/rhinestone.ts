/**
 * Rhinestone Account Initialization
 *
 * Pure async function that creates a RhinestoneAccount using the Rhinestone SDK.
 * Uses Pimlico as the bundler. Supports Para-wrapped accounts.
 */

import type { Signer } from '@ens-apps/transaction-manager'
import { type RhinestoneAccount, RhinestoneSDK } from '@rhinestone/sdk'
import type { Address, WalletClient } from 'viem'
import { customSepolia, publicClient } from '@/lib/wagmi'
import { registerHCAOwnership } from './hca-registry'
import type { SmartAccountType } from './types'
import { walletClientToAccount, wrapParaAccount } from './utils'

export interface RhinestoneConfig {
  chain: typeof customSepolia
  accountType: SmartAccountType
  bundlerUrl?: string
  paymasterUrl?: string
  sponsorshipPolicyId?: string
  rhinestoneApiKey: string
}

export interface InitializeRhinestoneParams {
  walletClient: WalletClient
  accountType?: SmartAccountType
  registerHCA?: boolean // Whether to register HCA ownership after account creation
}

export interface RhinestoneInitResult {
  client: RhinestoneAccount
  address: Address
  config: RhinestoneConfig
}

/**
 * Initialize a Rhinestone smart account
 *
 * @param params - Initialization parameters
 * @returns RhinestoneAccount, address, and config
 * @throws Error if initialization fails
 */
export async function initializeRhinestoneAccount(
  params: InitializeRhinestoneParams,
): Promise<RhinestoneInitResult> {
  const {
    walletClient,
    accountType = 'simple',
    registerHCA = accountType === 'hca',
  } = params

  const apiKey = import.meta.env.VITE_RHINESTONE_API_KEY
  if (!apiKey) {
    throw new Error(
      'Rhinestone API key not configured in environment variables',
    )
  }

  const pimlicoApiKey = import.meta.env.VITE_PIMLICO_API_KEY
  if (!pimlicoApiKey) {
    throw new Error(
      'Pimlico API key not configured (required for Rhinestone bundler)',
    )
  }

  const account = walletClientToAccount(walletClient)
  const eoaAddress = walletClient.account?.address

  if (!eoaAddress) {
    throw new Error('Wallet client must have an account address')
  }

  const wrappedAccount = wrapParaAccount(account)

  const sdk = new RhinestoneSDK({
    apiKey,
    bundler: {
      type: 'pimlico',
      apiKey: pimlicoApiKey,
    },
  })

  const rhinestoneAccount = await sdk.createAccount({
    owners: {
      type: 'ecdsa' as const,
      accounts: [wrappedAccount],
    },
  })

  const accountAddress = rhinestoneAccount.getAddress()

  // Register HCA ownership via smart account (sponsored) if requested
  if (registerHCA) {
    const signer: Signer = {
      type: 'rhinestone' as const,
      account: rhinestoneAccount as any,
      config: {
        chain: customSepolia,
        accountAddress,
        rhinestoneApiKey: apiKey,
      },
    }

    const result = await registerHCAOwnership({
      smartAccountAddress: accountAddress,
      eoaAddress,
      signer,
      publicClient,
    })

    if (result.isErr()) {
      throw new Error(
        `HCA registration failed: ${result.error.reason} - ${result.error.details}`,
      )
    }

    console.log('✅ HCA registration result:', result.value)
  }

  const config: RhinestoneConfig = {
    chain: customSepolia,
    accountType,
    bundlerUrl: undefined,
    paymasterUrl: undefined,
    sponsorshipPolicyId: undefined,
    rhinestoneApiKey: apiKey,
  }

  return {
    client: rhinestoneAccount,
    address: accountAddress,
    config,
  }
}
