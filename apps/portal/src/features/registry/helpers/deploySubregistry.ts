/**
 * Pure async function to deploy a subregistry via the verifiable factory.
 *
 * Uses transactionManager.startTransaction for Step 1 of the deploy flow.
 * Extracts deployed address from the transaction receipt.
 */

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { deploySubregistryWriteParameters } from '@ensdomains/ensjs/wallet'
import type {
  Account,
  Address,
  Chain,
  Hex,
  PublicClient,
  TransactionReceipt,
  Transport,
  WalletClient,
} from 'viem'
import { encodeFunctionData } from 'viem'

type WalletClientWithAccount = WalletClient<Transport, Chain, Account>

function extractDeployedAddress(
  receipt: TransactionReceipt | undefined,
): Address | undefined {
  if (!receipt) return undefined
  if (receipt.contractAddress) return receipt.contractAddress
  if (receipt.logs.length > 0) return receipt.logs[0]?.address
  return undefined
}

export interface DeploySubregistryParameters {
  readonly factoryAddress: Address
  readonly implAddress: Address
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly id: string
}

export interface DeploySubregistryResult {
  readonly txId: string
  readonly hash: Hex
  readonly deployedAddress: Address
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

  const txId = transactionManager.startTransaction(
    {
      type: 'custom',
      request: {
        type: 'eoa',
        from: walletClient.account.address,
        to: writeParams.address as Address,
        data,
        chainId,
      },
    },
    signer,
    {
      id,
      description: `Deploy subregistry`,
      publicClient,
      timeout: 120_000,
    },
  )

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
