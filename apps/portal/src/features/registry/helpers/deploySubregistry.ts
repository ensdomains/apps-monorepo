/**
 * Pure async function to deploy a subregistry via the verifiable factory.
 *
 * Uses transactionManager.startTransaction for Step 1 of the deploy flow.
 * Extracts deployed address from the transaction receipt.
 */

import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { deploySubregistryWriteParameters } from '@ensdomains/ensjs/wallet'
import type {
  Address,
  Hex,
  PublicClient,
  TransactionReceipt,
  WalletClient,
} from 'viem'
import { encodeFunctionData } from 'viem'
import type { WalletClientWithAccount } from '@/utils/types'

function extractDeployedAddress(
  receipt: TransactionReceipt | undefined,
): Address | undefined {
  if (!receipt) return undefined
  if (receipt.contractAddress) return receipt.contractAddress
  if (receipt.logs.length > 0) return receipt.logs[0]?.address
  return undefined
}

export interface DeploySubregistryTransactionParameters {
  readonly factoryAddress: Address
  readonly implAddress: Address
  readonly walletClient: WalletClient
  readonly chainId: number
}

export interface DeploySubregistryParameters
  extends DeploySubregistryTransactionParameters {
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly id: string
}

export interface DeploySubregistryResult {
  readonly txId: string
  readonly hash: Hex
  readonly deployedAddress: Address
}

/**
 * The prepared subregistry-deploy transaction — deterministic given the factory
 * and implementation addresses, so it can drive the pre-start gas estimate and
 * is the same intent submitted by `deploySubregistry`.
 */
export const prepareDeploySubregistryTransaction = ({
  factoryAddress,
  implAddress,
  walletClient,
  chainId,
}: DeploySubregistryTransactionParameters): CustomTransactionIntent => {
  if (!walletClient.account) {
    throw new Error('Wallet client must have account configured')
  }

  const walletWithAccount = walletClient as WalletClientWithAccount

  const writeParams = deploySubregistryWriteParameters(walletWithAccount, {
    factoryAddress,
    implAddress,
  })

  const data = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  })

  return {
    type: 'custom',
    request: {
      type: 'eoa',
      from: walletClient.account.address,
      to: writeParams.address,
      data,
      chainId,
    },
  }
}

export const deploySubregistry = async ({
  factoryAddress,
  implAddress,
  walletClient,
  publicClient,
  signer,
  chainId,
  id,
}: DeploySubregistryParameters): Promise<DeploySubregistryResult> => {
  const intent = prepareDeploySubregistryTransaction({
    factoryAddress,
    implAddress,
    walletClient,
    chainId,
  })

  const txId = transactionManager.startTransaction(intent, signer, {
    id,
    description: `Deploy subregistry`,
    publicClient,
    timeout: 120_000,
  })

  const result = await waitForTransaction(txId)
  const deployedAddress = extractDeployedAddress(result.receipt)

  if (!deployedAddress) {
    throw new Error('Could not extract deployed contract address from receipt')
  }

  return {
    txId,
    hash: result.hash,
    deployedAddress,
  }
}
