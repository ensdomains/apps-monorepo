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
import { deploySubregistryWriteParameters } from '@ensdomains/ensjs/wallet/v2'
import type {
  Address,
  Hex,
  PublicClient,
  TransactionReceipt,
  WalletClient,
} from 'viem'
import { bytesToBigInt, encodeFunctionData } from 'viem'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'
import type { WalletClientWithAccount } from '@/utils/types'

/**
 * A fresh CREATE2 salt for one deploy.
 *
 * Never lean on ensjs's default: it computes `DEFAULT_SALT` once, at module
 * load, so every deploy in a page session reuses it. The factory derives the
 * proxy address from `(msg.sender, salt)`, so a wallet's second deploy before a
 * reload targets an address it already occupies and reverts with empty data —
 * on every retry, until the page is reloaded.
 */
export const generateSubregistrySalt = (): bigint =>
  bytesToBigInt(crypto.getRandomValues(new Uint8Array(32)))

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
  /**
   * CREATE2 salt, from {@link generateSubregistrySalt}. Hold one per flow so the
   * gas estimate and the deploy encode the same call.
   */
  readonly salt: bigint
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

/** The subregistry-deploy intent, shared by the gas estimate and `deploySubregistry`. */
export const prepareDeploySubregistryTransaction = ({
  factoryAddress,
  implAddress,
  salt,
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
    salt,
  })

  const data = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  })

  return toEoaCustomIntent({
    from: walletClient.account.address,
    to: writeParams.address,
    data,
    chainId,
  })
}

export const deploySubregistry = async ({
  factoryAddress,
  implAddress,
  salt,
  walletClient,
  publicClient,
  signer,
  chainId,
  id,
}: DeploySubregistryParameters): Promise<DeploySubregistryResult> => {
  const intent = prepareDeploySubregistryTransaction({
    factoryAddress,
    implAddress,
    salt,
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
