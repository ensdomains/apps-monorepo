import type { SmartAccountConfig } from '@ens-apps/transaction-manager'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { KernelAccountClient, KernelValidator } from '@zerodev/sdk'
import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import type { SmartAccountClient as PimlicoAccountClient } from 'permissionless'
import type { Address, WalletClient } from 'viem'
import type { SessionProvider, TransactionInfra } from '@/utils/feature-flags'
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
  readonly client: AccountClient
  readonly address: Address
  readonly ownerAddress: Address
  readonly config: SmartAccountConfig
  readonly ecdsaValidator: KernelValidator<'ECDSAValidator'> | null
}

export interface InitializeAccountInput {
  readonly walletSource: WalletSource
  readonly walletClient?: WalletClient
  readonly paraClient?: ParaClient
  readonly provider: SessionProvider
  readonly accountType?: SmartAccountType
  readonly infrastructure?: TransactionInfra
}

export class AccountInitializationError extends TaggedError(
  'AccountInitializationError',
)<{
  provider: 'pimlico' | 'zerodev' | 'rhinestone' | 'routing'
  cause: unknown
}> {}

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
    ecdsaValidator: result.ecdsaValidator,
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
    ecdsaValidator: null,
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
    ecdsaValidator: null,
  }
}

/**
 * Initialize smart account based on provider and wallet source.
 *
 * Routing logic:
 * - Rhinestone provider → Rhinestone account (supports both Para-embedded and external wallets)
 * - Para-embedded + ZeroDev → Pimlico smart account
 * - External wallet + ZeroDev → ZeroDev Kernel account
 */
export function initializeAccountActor(
  input: InitializeAccountInput,
): ResultAsync<AccountInitResult, AccountInitializationError> {
  const {
    walletSource,
    walletClient,
    paraClient,
    provider,
    accountType,
    infrastructure,
  } = input

  // Rhinestone path: supports both external wallets and Para embedded
  if (provider === 'rhinestone') {
    if (!walletClient && !paraClient) {
      return errAsync(
        new AccountInitializationError({
          provider: 'routing',
          cause: new Error(
            'Missing wallet client or Para client for Rhinestone initialization',
          ),
        }),
      )
    }

    return fromPromise(
      initializeRhinestoneAccount({
        walletClient,
        paraClient,
        accountType,
        infrastructure,
      }),
      (error) =>
        new AccountInitializationError({
          provider: 'rhinestone',
          cause: error,
        }),
    ).map((result) => mapRhinestoneConfig(result, result.ownerAddress))
  }

  // Para-embedded + non-Rhinestone → Pimlico
  if (walletSource === 'para-embedded') {
    if (!paraClient) {
      return errAsync(
        new AccountInitializationError({
          provider: 'routing',
          cause: new Error('Missing Para client for Pimlico initialization'),
        }),
      )
    }

    return fromPromise(
      initializePimlicoAccount({
        walletSource,
        paraClient,
        accountType,
      }),
      (error) =>
        new AccountInitializationError({
          provider: 'pimlico',
          cause: error,
        }),
    ).map((result) => {
      const ownerAddress = (result.eoaAddress ?? result.address) as Address
      return mapPimlicoConfig(result, ownerAddress)
    })
  }

  // External wallet + non-Rhinestone → ZeroDev
  if (!walletClient) {
    return errAsync(
      new AccountInitializationError({
        provider: 'routing',
        cause: new Error(
          'Missing wallet client for external wallet initialization',
        ),
      }),
    )
  }

  const ownerAddress = walletClient.account?.address
  if (!ownerAddress) {
    return errAsync(
      new AccountInitializationError({
        provider: 'routing',
        cause: new Error('Wallet client must have an account address'),
      }),
    )
  }

  return fromPromise(
    initializeZeroDevAccount({
      walletClient,
      accountType,
    }),
    (error) =>
      new AccountInitializationError({
        provider: 'zerodev',
        cause: error,
      }),
  ).map((result) => mapZeroDevConfig(result, ownerAddress))
}
