/**
 * Rhinestone Account Initialization
 *
 * Pure async function that creates a RhinestoneAccount using the Rhinestone SDK.
 * Uses Pimlico as the bundler. Supports Para-wrapped accounts.
 */

import { type RhinestoneAccount, RhinestoneSDK } from '@rhinestone/sdk'
import type { Account, Address, WalletClient } from 'viem'
import {
  generatePrivateKey,
  privateKeyToAccount,
  privateKeyToAddress,
} from 'viem/accounts'
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
  eoaAccount: RhinestoneAccount
  eoaAccountSigner: Account
}

export const STORAGE_KEY = 'rhinestone-eoa-account-signer'

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

  // Check if we already have a stored EOA account signer
  let privateKey: `0x${string}`
  let eoaAccountSigner: Account

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as {
          privateKey: string
          address: string
        }
        privateKey = parsed.privateKey as `0x${string}`
        eoaAccountSigner = privateKeyToAccount(privateKey)
        console.log(
          '🔑 Reusing existing EOA account signer from localStorage',
          parsed.address,
        )
      } else {
        privateKey = generatePrivateKey()
        eoaAccountSigner = privateKeyToAccount(privateKey)

        const eoaAddress = privateKeyToAddress(privateKey)

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            privateKey,
            address: eoaAddress,
          }),
        )
        console.log('🔑 Generated new EOA account signer', eoaAddress)
      }
    } catch (error) {
      console.warn(
        'Failed to read from localStorage, generating new key:',
        error,
      )
      privateKey = generatePrivateKey()
      eoaAccountSigner = privateKeyToAccount(privateKey)

      const eoaAddress = privateKeyToAddress(privateKey)

      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            privateKey,
            address: eoaAddress,
          }),
        )
      } catch (storeError) {
        console.warn('Failed to store in localStorage:', storeError)
      }
      console.log('🔑 Generated new EOA account signer after error', eoaAddress)
    }
  } else {
    // No localStorage available (e.g., SSR), generate new key
    privateKey = generatePrivateKey()
    eoaAccountSigner = privateKeyToAccount(privateKey)
    console.log(
      '🔑 Generated new EOA account signer (no localStorage available)',
    )
  }

  const eoaAccount = await sdk.createAccount({
    account: { type: 'eoa' },
    eoa: wrappedAccount,
  })

  const rhinestoneAccount = await sdk.createAccount({
    owners: {
      type: 'ecdsa' as const,
      accounts: [wrappedAccount, eoaAccountSigner],
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
    eoaAccount,
    eoaAccountSigner,
  }
}
