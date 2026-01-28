/**
 * Subregistry Deployment Actor Functions
 *
 * Pure functions for subregistry deployment operations.
 * Each actor returns ResultAsync and calls transactionManager internally.
 */

import {
  deploySubregistryWriteParameters,
  setSubregistryWriteParameters,
} from '@ensdomains/ensjs/wallet'
import { errAsync, fromPromise, ResultAsync } from 'neverthrow'
import type {
  Account,
  Address,
  Chain,
  PublicClient,
  TransactionReceipt,
  Transport,
  WalletClient,
} from 'viem'
import { encodeFunctionData } from 'viem'
import { waitForTransactionReceiptById } from '../../helpers/transaction-status.helpers'
import { transactionManager } from '../../providers/transactionManager'
import type { EOASigner } from '../../types/signer.types'
import type { EOATransactionRequest } from '../../types/transaction.types'

type WalletClientWithAccount = WalletClient<Transport, Chain, Account>

/**
 * Extract deployed contract address from transaction receipt
 * Looks for contractAddress first, then falls back to first log address
 */
function extractDeployedAddress(
  receipt: TransactionReceipt,
): Address | undefined {
  // Contract creation transactions have contractAddress set
  if (receipt.contractAddress) {
    return receipt.contractAddress
  }

  // Factory pattern: the deployed contract address is in the first log
  if (receipt.logs.length > 0) {
    return receipt.logs[0]?.address
  }

  return undefined
}

// ============================================================================
// Actor Functions (exported for use with fromResultAsync in machine)
// ============================================================================

/**
 * Submit deploy subregistry transaction
 *
 * Encodes and submits the deploy transaction via transactionManager.
 * Returns the transaction ID for tracking.
 */
export function submitDeploySubregistryActor(input: {
  readonly name: string
  readonly factoryAddress: Address
  readonly implAddress: Address
  readonly signer: EOASigner
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly chainId: number
}): ResultAsync<string, Error> {
  const { walletClient } = input

  if (!walletClient.account) {
    return errAsync(new Error('Wallet client has no connected account'))
  }

  // Type-narrow to WalletClient with account after the check
  const walletWithAccount = walletClient as WalletClientWithAccount

  return ResultAsync.fromSafePromise(
    Promise.resolve().then(() => {
      const writeParams = deploySubregistryWriteParameters(walletWithAccount, {
        factoryAddress: input.factoryAddress,
        implAddress: input.implAddress,
      })

      const data = encodeFunctionData({
        abi: writeParams.abi,
        functionName: writeParams.functionName,
        args: writeParams.args,
      })

      const request: EOATransactionRequest = {
        type: 'eoa',
        from: walletWithAccount.account.address,
        to: writeParams.address,
        data,
        chainId: input.chainId,
      }

      console.log(
        '🚀 [SUBREGISTRY DEPLOYMENT] Submitting deploy transaction:',
        {
          name: input.name,
          factoryAddress: input.factoryAddress,
          implAddress: input.implAddress,
        },
      )

      const txId = transactionManager.startTransaction(
        { type: 'custom', request },
        input.signer,
        {
          description: `Deploy subregistry for ${input.name}`,
          publicClient: input.publicClient,
          timeout: 120000,
        },
      )

      return txId
    }),
  ).mapErr(
    (error) => new Error(`Failed to submit deploy transaction: ${error}`),
  )
}

/**
 * Resolve deployed address from deploy transaction
 *
 * Waits for the deploy transaction to complete and extracts
 * the deployed contract address from the receipt.
 */
export function resolveDeployedAddressActor(input: {
  txId: string
}): ResultAsync<{ deployedAddress: Address }, Error> {
  return fromPromise(
    (async () => {
      console.log(
        '⏳ [SUBREGISTRY DEPLOYMENT] Waiting for deploy transaction:',
        input.txId,
      )

      const receipt = await waitForTransactionReceiptById(input.txId)
      const deployedAddress = extractDeployedAddress(receipt)

      if (!deployedAddress) {
        throw new Error(
          'Could not extract deployed contract address from receipt',
        )
      }

      console.log(
        '✅ [SUBREGISTRY DEPLOYMENT] Deploy confirmed, contract address:',
        deployedAddress,
      )

      return { deployedAddress }
    })(),
    (error) => error as Error,
  )
}

/**
 * Submit setSubregistry transaction
 *
 * Encodes and submits the setSubregistry transaction to link
 * the deployed contract to the parent registry.
 */
export function submitSetSubregistryActor(input: {
  name: string
  label: string
  parentRegistry: Address
  deployedAddress: Address
  signer: EOASigner
  walletClient: WalletClient
  publicClient: PublicClient
  chainId: number
}): ResultAsync<string, Error> {
  const { walletClient } = input

  if (!walletClient.account) {
    return errAsync(new Error('Wallet client has no connected account'))
  }

  // Type-narrow to WalletClient with account after the check
  const walletWithAccount = walletClient as WalletClientWithAccount

  return ResultAsync.fromSafePromise(
    Promise.resolve().then(() => {
      const writeParams = setSubregistryWriteParameters(walletWithAccount, {
        registryAddress: input.parentRegistry,
        label: input.label,
        subregistryAddress: input.deployedAddress,
      })

      const data = encodeFunctionData({
        abi: writeParams.abi,
        functionName: writeParams.functionName,
        args: writeParams.args,
      })

      const request: EOATransactionRequest = {
        type: 'eoa',
        from: walletWithAccount.account.address,
        to: writeParams.address,
        data,
        chainId: input.chainId,
        gas: 500000n,
      }

      console.log(
        '🚀 [SUBREGISTRY DEPLOYMENT] Submitting setSubregistry transaction:',
        {
          name: input.name,
          label: input.label,
          parentRegistry: input.parentRegistry,
          deployedAddress: input.deployedAddress,
        },
      )

      const txId = transactionManager.startTransaction(
        { type: 'custom', request },
        input.signer,
        {
          description: `Set subregistry for ${input.name}`,
          publicClient: input.publicClient,
          timeout: 120000,
        },
      )

      return txId
    }),
  ).mapErr(
    (error) =>
      new Error(`Failed to submit setSubregistry transaction: ${error}`),
  )
}
