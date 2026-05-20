import type { Signer } from '@ens-apps/transaction-manager'
import {
  ENS_SEPOLIA_CONTRACTS,
  pollTransactionStatus,
  type TransactionRequest,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { errAsync, fromPromise, okAsync, type ResultAsync } from 'neverthrow'
import type { Address, Hex, PublicClient } from 'viem'
import { encodeFunctionData, zeroAddress } from 'viem'
import { HCA_FACTORY_ABI } from '../hca-factory.abi'

/**
 * Tagged error for HCA registration failures
 */
export class HCARegistrationError extends Error {
  readonly _tag = 'HCARegistrationError'

  constructor(
    public readonly reason:
      | 'different-owner'
      | 'tx-failed'
      | 'tx-not-found'
      | 'read-failed',
    public readonly details?: unknown,
  ) {
    super(`HCA registration failed: ${reason}`)
    this.name = 'HCARegistrationError'
  }
}

/**
 * Discriminated union result type for HCA registration
 */
export type HCARegistrationResult =
  | { status: 'already-registered' }
  | { status: 'registered'; hash: string }

/**
 * Parameters for HCA registration
 */
export interface HCARegistrationParams {
  smartAccountAddress: Address
  eoaAddress: Address
  signer: Signer
  publicClient: PublicClient
}

/**
 * Register HCA ownership mapping via smart account transaction (sponsored)
 *
 * This links the smart account address to its EOA owner in the HCA Factory contract.
 * The transaction is gas-sponsored via the smart account.
 *
 * @returns ResultAsync with either success status or HCARegistrationError
 */
export function registerHCAOwnership(
  params: HCARegistrationParams,
): ResultAsync<HCARegistrationResult, HCARegistrationError> {
  const { smartAccountAddress, eoaAddress, signer, publicClient } = params

  console.log('🔐 Registering HCA ownership via smart account (sponsored):', {
    smartAccount: smartAccountAddress,
    eoaOwner: eoaAddress,
    hcaFactory: ENS_SEPOLIA_CONTRACTS.HCAFactory,
    signerType: signer.type,
  })

  // Check current owner on-chain
  return fromPromise(
    publicClient.readContract({
      address: ENS_SEPOLIA_CONTRACTS.HCAFactory,
      abi: HCA_FACTORY_ABI,
      functionName: 'getAccountOwner',
      args: [smartAccountAddress],
    }),
    (error) => new HCARegistrationError('read-failed', error),
  ).andThen((currentOwner) => {
    // Already registered to same owner - success (no-op)
    if (currentOwner.toLowerCase() === eoaAddress.toLowerCase()) {
      console.log('✅ HCA ownership already registered to this EOA')
      return okAsync({ status: 'already-registered' as const })
    }

    // Different owner already registered - error
    if (currentOwner !== zeroAddress) {
      console.error('❌ HCA already has a different owner:', currentOwner)
      return errAsync(
        new HCARegistrationError('different-owner', { currentOwner }),
      )
    }

    // Build transaction to register ownership
    const data = encodeFunctionData({
      abi: HCA_FACTORY_ABI,
      functionName: 'setAccountOwner',
      args: [smartAccountAddress, eoaAddress],
    }) as Hex

    const calls = [
      {
        to: ENS_SEPOLIA_CONTRACTS.HCAFactory,
        data,
        value: 0n,
      },
    ]

    const chainId = publicClient.chain?.id
    if (!chainId) {
      return errAsync(
        new HCARegistrationError(
          'read-failed',
          new Error('publicClient is missing a chain configuration'),
        ),
      )
    }

    // Build request based on signer type
    let request: TransactionRequest
    if (signer.type === 'erc4337') {
      request = {
        type: 'erc4337',
        from: smartAccountAddress,
        to: ENS_SEPOLIA_CONTRACTS.HCAFactory,
        data,
        value: 0n,
        chainId,
        erc4337Params: {
          calls,
          sponsored: true,
        },
      } as TransactionRequest
    } else {
      // Rhinestone (default)
      request = {
        type: 'rhinestone-intent',
        from: smartAccountAddress,
        to: ENS_SEPOLIA_CONTRACTS.HCAFactory,
        data,
        value: 0n,
        chainId,
        rhinestoneParams: {
          calls,
          sponsored: true,
        },
      } as TransactionRequest
    }

    // Submit transaction
    const txId = transactionManager.startTransaction(
      {
        type: 'custom',
        request,
      },
      signer,
      {
        description: 'Register HCA ownership',
        publicClient,
      },
    )

    console.log('📤 HCA ownership registration tx submitted, txId:', txId)

    // Await transaction completion
    return pollTransactionStatus(txId)
      .map((hash) => {
        console.log('✅ HCA ownership registration confirmed, hash:', hash)
        return { status: 'registered' as const, hash: hash ?? '' }
      })
      .mapErr((error) => {
        console.error('❌ HCA ownership registration failed:', error)
        return new HCARegistrationError('tx-failed', error)
      })
  })
}

/**
 * Get the registered owner of an HCA smart account
 *
 * @returns The EOA owner address, or zeroAddress if not registered
 */
export function getHCAOwner(params: {
  smartAccountAddress: Address
  publicClient: PublicClient
}): ResultAsync<Address, HCARegistrationError> {
  const { smartAccountAddress, publicClient } = params

  return fromPromise(
    publicClient.readContract({
      address: ENS_SEPOLIA_CONTRACTS.HCAFactory,
      abi: HCA_FACTORY_ABI,
      functionName: 'getAccountOwner',
      args: [smartAccountAddress],
    }),
    (error) => new HCARegistrationError('read-failed', error),
  )
}
