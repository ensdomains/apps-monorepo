import type { SmartAccountConfig } from '@ens-apps/transaction-manager'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { KernelAccountClient } from '@zerodev/sdk'
import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import type { SmartAccountClient as PimlicoAccountClient } from 'permissionless'
import type { Address, WalletClient } from 'viem'
import type { SessionProvider } from '@/utils/feature-flags'
import { initializePimlicoAccount, type PimlicoInitResult } from '../pimlico'
import {
  initializeRhinestoneAccount,
  type RhinestoneInitResult,
} from '../rhinestone'
import type {
  WalletSource as BaseWalletSource,
  ParaClient,
  SmartAccountType,
} from '../types'
import {
  initializeZeroDevAccount,
  type ZeroDevInitResult,
} from '../zerodev/kernel'

type WalletSource = Exclude<BaseWalletSource, null>

export type AccountClient =
  | KernelAccountClient
  | RhinestoneAccount
  | PimlicoAccountClient

export interface AccountInitResult {
  client: AccountClient
  address: Address
  ownerAddress: Address
  config: SmartAccountConfig
}

export interface InitializeAccountInput {
  walletSource: WalletSource
  walletClient?: WalletClient
  paraClient?: ParaClient
  provider: SessionProvider
  accountType?: SmartAccountType
}

function mapZeroDevConfig(
  result: ZeroDevInitResult,
  ownerAddress: Address,
): AccountInitResult {
  const smartConfig: SmartAccountConfig = {
    chain: result.config.chain,
    accountAddress: result.address,
    accountType: result.config.accountType,
    pimlicoApiKey: result.config.pimlicoApiKey,
  }

  return {
    client: result.client,
    address: result.address,
    ownerAddress,
    config: smartConfig,
  }
}

function mapPimlicoConfig(
  result: PimlicoInitResult,
  ownerAddress: Address,
): AccountInitResult {
  const smartConfig: SmartAccountConfig = {
    chain: result.config.chain,
    accountAddress: result.address,
    accountType: result.config.accountType,
    pimlicoApiKey: result.config.pimlicoApiKey,
  }

  return {
    client: result.client,
    address: result.address,
    ownerAddress,
    config: smartConfig,
  }
}

function mapRhinestoneConfig(
  result: RhinestoneInitResult,
  ownerAddress: Address,
): AccountInitResult {
  const smartConfig: SmartAccountConfig = {
    chain: result.config.chain,
    accountAddress: result.address,
    accountType: result.config.accountType,
    rhinestoneApiKey: result.config.rhinestoneApiKey,
  }

  return {
    client: result.client,
    address: result.address,
    ownerAddress,
    config: smartConfig,
  }
}

/**
 * Initialize smart account based on wallet source and provider.
 *
 * Routing logic:
 * - Para-embedded wallets → Pimlico (no sessions needed)
 * - External wallets + Rhinestone flag → Rhinestone account
 * - External wallets + ZeroDev flag → ZeroDev Kernel account
 */
export function initializeAccountActor(
  input: InitializeAccountInput,
): ResultAsync<AccountInitResult, Error> {
  const { walletSource, walletClient, paraClient, provider, accountType } =
    input

  if (walletSource === 'para-embedded') {
    if (!paraClient) {
      return errAsync(
        new Error('Missing Para client for Pimlico initialization'),
      )
    }

    return fromPromise(
      initializePimlicoAccount({
        walletSource,
        paraClient,
        accountType,
      }),
      (error) =>
        new Error(
          `Failed to initialize Pimlico account: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
    ).map((result) => {
      const ownerAddress = (result.eoaAddress ?? result.address) as Address
      return mapPimlicoConfig(result, ownerAddress)
    })
  }

  if (!walletClient) {
    return errAsync(
      new Error('Missing wallet client for external wallet initialization'),
    )
  }

  const ownerAddress = walletClient.account?.address as Address | undefined
  if (!ownerAddress) {
    return errAsync(new Error('Wallet client must have an account address'))
  }

  if (provider === 'rhinestone') {
    return fromPromise(
      initializeRhinestoneAccount({
        walletClient,
        accountType,
      }),
      (error) =>
        new Error(
          `Failed to initialize Rhinestone account: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
    ).map((result) => mapRhinestoneConfig(result, ownerAddress))
  }

  return fromPromise(
    initializeZeroDevAccount({
      walletClient,
      accountType,
    }),
    (error) =>
      new Error(
        `Failed to initialize ZeroDev account: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
  ).map((result) => mapZeroDevConfig(result, ownerAddress))
}
