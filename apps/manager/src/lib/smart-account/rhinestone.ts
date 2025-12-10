/**
 * Rhinestone Account Initialization
 *
 * Pure async function that creates a RhinestoneAccount using the Rhinestone SDK.
 * Uses Pimlico as the bundler. Supports Para-wrapped accounts.
 */

import { type RhinestoneAccount, RhinestoneSDK } from '@rhinestone/sdk'
import type { Address, WalletClient } from 'viem'
import { customSepolia } from '@/lib/wagmi'
import { walletClientToAccount, wrapParaAccount } from './utils'

export interface RhinestoneConfig {
  chain: typeof customSepolia
  bundlerUrl?: string
  paymasterUrl?: string
  sponsorshipPolicyId?: string
  rhinestoneApiKey: string
}

export interface InitializeRhinestoneParams {
  walletClient: WalletClient
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
  const { walletClient } = params

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

  const config: RhinestoneConfig = {
    chain: customSepolia,
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
