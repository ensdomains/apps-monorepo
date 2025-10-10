import { ok, err, type Result } from 'neverthrow'
import type { PublicClient, WalletClient, Hex } from 'viem'
import { RhinestoneAccountService, type RhinestoneAccountConfig, type ENSRenewalParams } from '../services/rhinestone-account.service'
import type { TransactionRequest, TransactionOptions, EOATransactionRequest } from '../types/transaction.types'

export interface PrepareENSRenewalParams {
  publicClient: PublicClient
  walletClient?: WalletClient
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
    walletClient,
    name,
    duration,
    chainId,
    useSmartAccount,
    rhinestoneConfig,
  } = params

  try {
    const rhinestoneService = new RhinestoneAccountService(
      publicClient,
      walletClient,
      rhinestoneConfig
    )

    // Get the renewal price and prepare transaction
    const txResult = await rhinestoneService.prepareENSRenewalTransaction({
      name,
      duration,
    })

    if (txResult.isErr()) {
      return txResult
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
          from: walletClient?.account?.address,
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
          from: walletClient?.account?.address,
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
  try {
    const rhinestoneService = new RhinestoneAccountService(publicClient)
    const result = await rhinestoneService.getRenewalPrice(name, duration)

    if (result.isErr()) {
      return err(result.error)
    }

    return ok(result.value)
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error('Failed to get renewal price')
    )
  }
}

/**
 * Gets the Rhinestone smart account address for the current wallet
 */
export async function getRhinestoneSmartAccountAddress(
  publicClient: PublicClient,
  walletClient: WalletClient,
  rhinestoneConfig?: RhinestoneAccountConfig
): Promise<Result<Hex, Error>> {
  try {
    const rhinestoneService = new RhinestoneAccountService(
      publicClient,
      walletClient,
      rhinestoneConfig
    )

    const result = await rhinestoneService.getSmartAccountAddress()

    if (result.isErr()) {
      return err(result.error)
    }

    return ok(result.value)
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error('Failed to get smart account address')
    )
  }
}
