/**
 * Pimlico Account Initialization
 *
 * Pure async function that creates a SmartAccountClient using permissionless SDK
 * with Pimlico bundler/paymaster. Supports both Para-embedded and external wallets.
 */

import { createParaAccount } from '@getpara/viem-v2-integration'
import {
  createSmartAccountClient,
  type SmartAccountClient,
} from 'permissionless'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import { toOwner } from 'permissionless/utils'
import type { Address, WalletClient } from 'viem'
import { http } from 'viem'
import { entryPoint07Address } from 'viem/account-abstraction'
import { customSepolia, publicClient } from '@/lib/wagmi'
import { registerHCAOwnershipSafe } from './hca-registry'
import type { SmartAccountType, WalletSource } from './types'
import type { ParaClient } from './useSmartAccount'
import { wrapParaAccount } from './utils'

export interface PimlicoConfig {
  chain: typeof customSepolia
  accountType: SmartAccountType
}

export interface InitializePimlicoParams {
  walletSource: WalletSource
  walletClient?: WalletClient
  paraClient?: ParaClient
  accountType?: SmartAccountType
  registerHCA?: boolean // Whether to register HCA ownership after account creation
}

export interface PimlicoInitResult {
  client: SmartAccountClient
  address: Address
  config: PimlicoConfig
}

/**
 * Initialize a Pimlico smart account
 *
 * @param params - Initialization parameters
 * @returns SmartAccountClient, address, and config
 * @throws Error if initialization fails
 */
export async function initializePimlicoAccount(
  params: InitializePimlicoParams,
): Promise<PimlicoInitResult> {
  const {
    walletSource,
    walletClient,
    paraClient,
    accountType = 'simple',
    registerHCA = accountType === 'hca', // Auto-register if accountType is 'hca'
  } = params

  const PIMLICO_API_KEY = import.meta.env.VITE_PIMLICO_API_KEY
  if (!PIMLICO_API_KEY) {
    throw new Error('Pimlico API key not configured in environment variables')
  }

  const PIMLICO_URL = `https://api.pimlico.io/v2/${customSepolia.id}/rpc?apikey=${PIMLICO_API_KEY}`

  let ownerAccount: Parameters<typeof toSimpleSmartAccount>[0]['owner']
  let eoaAddress: Address | null = null

  if (walletSource === 'external-wallet' && walletClient) {
    ownerAccount = await toOwner({ owner: walletClient })
    eoaAddress = walletClient.account?.address ?? null
  } else if (walletSource === 'para-embedded' && paraClient) {
    ownerAccount = wrapParaAccount(
      createParaAccount(paraClient),
    ) as typeof ownerAccount
  } else {
    throw new Error('No valid wallet connection for Pimlico initialization')
  }

  const smartAccount = await toSimpleSmartAccount({
    owner: ownerAccount,
    client: publicClient,
    entryPoint: { address: entryPoint07Address, version: '0.7' },
  })

  if (registerHCA && eoaAddress && walletClient) {
    await registerHCAOwnershipSafe({
      smartAccountAddress: smartAccount.address,
      eoaAddress,
      walletClient,
      publicClient,
      accountType: 'pimlico',
    })
  }

  const pimlicoClient = createPimlicoClient({
    transport: http(PIMLICO_URL),
    entryPoint: { address: entryPoint07Address, version: '0.7' },
  })

  const client = createSmartAccountClient({
    account: smartAccount,
    chain: customSepolia,
    bundlerTransport: http(PIMLICO_URL),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () =>
        (await pimlicoClient.getUserOperationGasPrice()).fast,
    },
  })

  const config: PimlicoConfig = {
    chain: customSepolia,
    accountType,
  }

  return {
    client,
    address: smartAccount.address,
    config,
  }
}
