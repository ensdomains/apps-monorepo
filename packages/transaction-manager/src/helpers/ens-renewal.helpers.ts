import { ok, err, type Result } from 'neverthrow'
import type { PublicClient, WalletClient, Hex } from 'viem'
import {
  prepareENSRenewalTransaction,
  getRhinestoneAccountAddress,
  initializeRhinestoneAccount,
  type RhinestoneAccountConfig,
  type ENSRenewalParams
} from './rhinestone-account.helpers'
import type { TransactionRequest, TransactionOptions, EOATransactionRequest } from '../types/transaction.types'

export interface PrepareENSRenewalParams {
  publicClient: PublicClient
  from: Hex  // Address of the account (EOA or smart account)
  name: string
  duration: bigint
  chainId: number
  useSmartAccount?: boolean
  rhinestoneConfig?: RhinestoneAccountConfig
}

export interface ENSRenewalTransactionData {
  request: TransactionRequest
  options?: TransactionOptions
}

/**
 * Prepares an ENS renewal transaction (EOA or Smart Account)
 */
export async function prepareENSRenewal(
  params: PrepareENSRenewalParams
): Promise<Result<ENSRenewalTransactionData, Error>> {
  const {
    publicClient,
    from,
    name,
    duration,
    chainId,
    useSmartAccount,
    rhinestoneConfig,
  } = params

  try {

    // Get the renewal price and prepare transaction using functional helper
    const txResult = await prepareENSRenewalTransaction(publicClient, {
      name,
      duration,
    })

    if (txResult.isErr()) {
      return err(txResult.error as Error)
    }

    const { to, data, value } = txResult.value

    if (useSmartAccount && rhinestoneConfig) {
      // Smart account transaction
      return ok({
        request: {
          type: 'rhinestone-intent',
          to,
          data,
          value,
          from,
          chainId,
          rhinestoneParams: { name, duration },
        },
        options: {
          rhinestoneConfig,
        },
      })
    } else {
      // EOA transaction
      return ok({
        request: {
          type: 'eoa',
          to,
          data,
          value,
          from,
          chainId,
        } as EOATransactionRequest,
      })
    }
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error('Failed to prepare ENS renewal')
    )
  }
}

/**
 * Gets the renewal price for an ENS name
 */
export async function getENSRenewalPrice(
  publicClient: PublicClient,
  name: string,
  duration: bigint
): Promise<Result<bigint, Error>> {
  const result = await prepareENSRenewalTransaction(publicClient, { name, duration })
  return result.map(tx => tx.value).mapErr(err => err as Error)
}

/**
 * Gets the Rhinestone smart account address for the current wallet
 */
export async function getRhinestoneSmartAccountAddress(
  publicClient: PublicClient,
  walletClient: WalletClient,
  rhinestoneConfig?: RhinestoneAccountConfig
): Promise<Result<Hex, Error>> {
  if (!rhinestoneConfig) {
    return err(new Error('Rhinestone config required'))
  }

  const accountResult = await initializeRhinestoneAccount(walletClient, rhinestoneConfig)
  if (accountResult.isErr()) {
    return err(accountResult.error as Error)
  }

  return getRhinestoneAccountAddress(accountResult.value).mapErr(err => err as Error)
}
