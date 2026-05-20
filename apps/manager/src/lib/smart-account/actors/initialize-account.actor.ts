import type { SmartAccountConfig } from '@ens-apps/transaction-manager'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type {
  AccountError,
  ExecutionError,
  OrchestratorError,
} from '@rhinestone/sdk/errors'
import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import type { Address, WalletClient } from 'viem'
import type { TransactionInfra } from '@/utils/feature-flags'
import {
  initializeRhinestoneAccount,
  type RhinestoneInitResult,
} from '../rhinestone'
import type { WalletSource as BaseWalletSource, ParaClient } from '../types'

type WalletSource = Exclude<BaseWalletSource, null>

// Provider-specific error cause types
export type RhinestoneErrorCause =
  | AccountError
  | ExecutionError
  | OrchestratorError

export type RoutingErrorCause = Error

export type AccountInitializationErrorCause =
  | RhinestoneErrorCause
  | RoutingErrorCause

export type AccountClient = RhinestoneAccount
export interface AccountInitResult {
  readonly client: AccountClient
  readonly address: Address
  readonly ownerAddress: Address
  readonly config: SmartAccountConfig
}

export interface InitializeAccountInput {
  readonly walletSource: WalletSource
  readonly walletClient?: WalletClient
  readonly paraClient?: ParaClient
  readonly infrastructure?: TransactionInfra
}

export class AccountInitializationError extends TaggedError(
  'AccountInitializationError',
)<{
  provider: 'rhinestone' | 'routing'
  cause: AccountInitializationErrorCause
}> {}

function mapRhinestoneConfig(
  result: RhinestoneInitResult,
  ownerAddress: Address,
): AccountInitResult {
  const smartConfig: SmartAccountConfig = {
    chain: result.config.chain,
    accountAddress: result.address,
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
 * Initialize smart account.
 *
 * Rhinestone is the only smart-account provider used by the manager app;
 * it supports both external wallets and Para-embedded accounts. The
 * account is always deployed in HCA (Hybrid Custodial Account) mode.
 */
export function initializeAccountActor(
  input: InitializeAccountInput,
): ResultAsync<AccountInitResult, AccountInitializationError> {
  const { walletClient, paraClient, infrastructure } = input

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
      infrastructure,
    }),
    (error) =>
      new AccountInitializationError({
        provider: 'rhinestone',
        cause: error as RhinestoneErrorCause,
      }),
  ).map((result) => mapRhinestoneConfig(result, result.ownerAddress))
}

// Type guards for narrowing AccountInitializationError by provider
export const isRhinestoneInitError = (
  error: AccountInitializationError,
): error is AccountInitializationError & { provider: 'rhinestone' } =>
  error.provider === 'rhinestone'

export const isRoutingInitError = (
  error: AccountInitializationError,
): error is AccountInitializationError & { provider: 'routing' } =>
  error.provider === 'routing'
