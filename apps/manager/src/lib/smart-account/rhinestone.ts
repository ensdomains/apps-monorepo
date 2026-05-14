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
import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { type RhinestoneAccount, RhinestoneSDK } from '@rhinestone/sdk'
import { toast } from 'sonner'
import {
  type Account,
  type Address,
  type Hex,
  type WalletClient,
  zeroAddress,
} from 'viem'
import { customSepolia, publicClient } from '@/lib/wagmi'
import { registerHCAOwnership } from './hca-registry'
import type { ParaClient, SmartAccountType } from './types'
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

  const isLocalOrchestrator = !!import.meta.env.VITE_RHINESTONE_ENDPOINT_URL
  const apiKey =
    import.meta.env.VITE_RHINESTONE_API_KEY ||
    (isLocalOrchestrator ? 'local-dev' : undefined)
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

  // Build SDK options — local orchestrator uses custom endpoint + RPC
  const endpointUrl = import.meta.env.VITE_RHINESTONE_ENDPOINT_URL || undefined
  const customRpcUrls = import.meta.env.VITE_RHINESTONE_CUSTOM_RPC_URLS
    ? JSON.parse(import.meta.env.VITE_RHINESTONE_CUSTOM_RPC_URLS)
    : undefined

  const sdkOptions: ConstructorParameters<typeof RhinestoneSDK>[0] = {
    apiKey,
    ...(endpointUrl && { endpointUrl }),
    ...(customRpcUrls && { customRpcUrls }),
    ...(pimlicoApiKey && {
      bundler: { type: 'pimlico' as const, apiKey: pimlicoApiKey },
    }),
  }

  const sdk = new RhinestoneSDK(sdkOptions)

  const rhinestoneAccount = await sdk.createAccount({
    owners: {
      type: 'ecdsa' as const,
      accounts: [ownerAccount],
    },
    experimental_sessions: { enabled: true },
  })

  const accountAddress = rhinestoneAccount.getAddress()

  // SCA must be on-chain before routing txs; bare `.deploy()` 422s the intents path (empty tokenRequests → ZERO_BALANCE), so we deploy via a noop call instead (Rhinestone/Timur).
  // One loading toast for the whole setup (deploy + optional HCA) so we don't flash success early.
  const setupToastId = `setup-sca-${accountAddress}`
  let setupToastShown = false

  const deployed = await rhinestoneAccount.isDeployed(customSepolia)
  if (!deployed) {
    console.log(
      '🔧 [RHINESTONE] Deploying smart account on-chain via dummy call...',
    )
    toast.loading(i18n._(msg`Setting up your smart account`), {
      description: i18n._(msg`Deploying on-chain…`),
      id: setupToastId,
    })
    setupToastShown = true
    try {
      await rhinestoneAccount.sendTransaction({
        chain: customSepolia,
        calls: [
          {
            to: zeroAddress,
            value: 0n,
            data: '0x',
          },
        ],
        sponsored: true,
      })
      console.log(`✅ [RHINESTONE] Smart account deployed: ${accountAddress}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error('❌ [RHINESTONE] Failed to deploy smart account:', error)
      toast.error(i18n._(msg`Failed to deploy smart account`), {
        description: message,
        id: setupToastId,
        duration: 5000,
      })
      throw error
    }
  }

  // Register HCA ownership via smart account (sponsored) if requested.
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

    // Only update the toast description if we already have one on-screen
    // (i.e. we deployed in this call). If the account was already deployed,
    // `registerHCAOwnership` is most often a no-op (returns
    // 'already-registered' after a read), and we don't want to flash a toast
    // for nothing. Errors below still surface even without a prior toast.
    if (setupToastShown) {
      toast.loading(i18n._(msg`Setting up your smart account`), {
        description: i18n._(msg`Registering account ownership…`),
        id: setupToastId,
      })
    }

    const result = await registerHCAOwnership({
      smartAccountAddress: accountAddress,
      eoaAddress,
      signer,
      publicClient,
    })

    if (result.isErr()) {
      toast.error(i18n._(msg`Smart account setup failed`), {
        description: `${result.error.reason}`,
        id: setupToastId,
        duration: 5000,
      })
      throw new Error(
        `HCA registration failed: ${result.error.reason} - ${result.error.details}`,
      )
    }

    console.log('✅ HCA registration result:', result.value)
  }

  // Only close out the toast if we actually showed one (i.e. we did real
  // setup work). If the account was already deployed AND already registered,
  // we stayed silent the whole time.
  if (setupToastShown) {
    toast.success(i18n._(msg`Smart account ready`), {
      id: setupToastId,
      duration: 3000,
    })
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
