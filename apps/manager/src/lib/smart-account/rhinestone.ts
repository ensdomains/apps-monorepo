/**
 * Rhinestone Account Initialization
 *
 * Pure async function that creates a RhinestoneAccount using the Rhinestone SDK.
 *
 * Two infrastructure paths:
 * - Warp (default): No bundler — SDK routes through Orchestrator → Relayer Market (intents)
 * - Pimlico: ERC-4337 bundler for UserOperations
 */

import type {
  RhinestoneSigner,
  TransactionInfra,
} from '@ens-apps/transaction-manager'
import { createParaAccount } from '@getpara/viem-v2-integration'
import {
  type RhinestoneAccount,
  RhinestoneSDK,
  walletClientToAccount,
  wrapParaAccount,
} from '@rhinestone/sdk'
import type { Account, Address, WalletClient } from 'viem'
import { customSepolia, publicClient } from '@/lib/wagmi'
import { registerHCAOwnership } from './hca-registry'
import type { ParaClient, SmartAccountType } from './types'

export interface RhinestoneConfig {
  chain: typeof customSepolia
  accountType: SmartAccountType
  bundlerUrl?: string
  paymasterUrl?: string
  sponsorshipPolicyId?: string
  rhinestoneApiKey: string
}

export interface InitializeRhinestoneParams {
  walletClient?: WalletClient
  paraClient?: ParaClient
  accountType?: SmartAccountType
  registerHCA?: boolean // Whether to register HCA ownership after account creation
  infrastructure?: TransactionInfra
}

export interface RhinestoneInitResult {
  client: RhinestoneAccount
  address: Address
  ownerAddress: Address
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
    paraClient,
    accountType = 'simple',
    registerHCA = accountType === 'hca',
    infrastructure = 'warp',
  } = params

  const apiKey = import.meta.env.VITE_RHINESTONE_API_KEY
  if (!apiKey) {
    throw new Error(
      'Rhinestone API key not configured in environment variables',
    )
  }

  let eoaAddress: Address
  let ownerAccount: Account

  if (walletClient?.account?.address) {
    ownerAccount = walletClientToAccount(walletClient)
    eoaAddress = walletClient.account.address
  } else if (paraClient) {
    const paraAccount = createParaAccount(paraClient)
    eoaAddress = paraAccount.address as Address
    ownerAccount = wrapParaAccount(paraAccount)
  } else {
    throw new Error(
      'Either walletClient or paraClient must be provided for Rhinestone initialization',
    )
  }

  // Always include Pimlico bundler when available.
  // Warp (intents) doesn't need it, but session-based transactions require
  // sendUserOperation (ERC-4337) since SDK v1.2.14 rejects experimental_session
  // signers in sendTransaction.
  const pimlicoApiKey = import.meta.env.VITE_PIMLICO_API_KEY

  if (infrastructure === 'pimlico' && !pimlicoApiKey) {
    throw new Error(
      'Pimlico API key not configured (required for ERC-4337 bundler)',
    )
  }

  const sdk = pimlicoApiKey
    ? new RhinestoneSDK({
        apiKey,
        bundler: { type: 'pimlico', apiKey: pimlicoApiKey },
      })
    : new RhinestoneSDK({ apiKey })

  const rhinestoneAccount = await sdk.createAccount({
    owners: {
      type: 'ecdsa' as const,
      accounts: [ownerAccount],
    },
    experimental_sessions: { enabled: true },
  })

  const accountAddress = rhinestoneAccount.getAddress()

  // Deploy the smart account on-chain if not already deployed.
  // Both Pimlico (ERC-4337) and Warp (intents) require the account to exist on-chain
  // before sending transactions — the orchestrator simulates bundles against deployed state.
  const deployed = await rhinestoneAccount.isDeployed(customSepolia)
  if (!deployed) {
    console.log('🔧 [RHINESTONE] Deploying smart account on-chain...')
    await rhinestoneAccount.deploy(customSepolia, { sponsored: true })
    console.log('✅ [RHINESTONE] Smart account deployed:', accountAddress)
  }

  // Register HCA ownership via smart account (sponsored) if requested
  if (registerHCA) {
    const signer: RhinestoneSigner = {
      type: 'rhinestone' as const,
      // Rhinestone account types can come from different package instances
      // across workspace boundaries. We intentionally adapt via `unknown`
      // to the transaction-manager signer contract while keeping runtime shape.
      account: rhinestoneAccount as unknown as RhinestoneSigner['account'],
      config: {
        chain: customSepolia,
        accountAddress,
        rhinestoneApiKey: apiKey,
        defaultInfra: infrastructure,
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
    ownerAddress: eoaAddress,
    config,
  }
}
