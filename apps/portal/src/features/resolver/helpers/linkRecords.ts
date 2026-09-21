import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import {
  linkToNodeWriteParameters,
  linkToRecordWriteParameters,
} from '@ensdomains/ensjs/wallet/v2'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'

/** The record id that unlinks a name; it then reads the resolver's default record. */
const UNLINKED_RECORD_ID = 0n

export interface LinkToNodeTransactionParameters {
  /** Name that should start serving the target's records. */
  readonly sourceName: string
  /** Name whose current record the source should use. */
  readonly targetName: string
  readonly resolverAddress: Address
  readonly walletClient: WalletClient
  readonly chainId: number
}

/** The `linkToNode` intent, shared by the gas estimate and `linkToNode`. */
export const prepareLinkToNodeTransaction = ({
  sourceName,
  targetName,
  resolverAddress,
  walletClient,
  chainId,
}: LinkToNodeTransactionParameters): CustomTransactionIntent => {
  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  const writeParams = linkToNodeWriteParameters(
    walletClient as Parameters<typeof linkToNodeWriteParameters>[0],
    { sourceName, targetName, resolverAddress },
  )

  return toEoaCustomIntent({
    from: walletClient.account.address,
    to: resolverAddress,
    data: encodeFunctionData({
      abi: writeParams.abi,
      functionName: writeParams.functionName,
      args: writeParams.args,
    } as Parameters<typeof encodeFunctionData>[0]),
    chainId,
  })
}

export interface LinkToNodeParameters extends LinkToNodeTransactionParameters {
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly id: string
}

export interface LinkRecordsResult {
  readonly txId: string
  readonly hash: Hex
}

export const linkToNode = async (
  params: LinkToNodeParameters,
): Promise<LinkRecordsResult> => {
  const { sourceName, targetName, publicClient, signer, chainId, id } = params

  const txId = transactionManager.startTransaction(
    prepareLinkToNodeTransaction(params),
    signer,
    {
      id,
      description: `Link ${sourceName} to the records of ${targetName}`,
      publicClient,
      chainId,
    },
  )

  const result = await waitForTransaction(txId)
  return { txId, hash: result.hash }
}

export interface UnlinkTransactionParameters {
  readonly sourceName: string
  readonly resolverAddress: Address
  readonly walletClient: WalletClient
  readonly chainId: number
}

/**
 * The `linkToRecord(name, 0)` intent, shared by the gas estimate and `unlink`.
 * An unlinked name reads the resolver's default record; its previous record
 * stays on the resolver and can be linked back.
 */
export const prepareUnlinkTransaction = ({
  sourceName,
  resolverAddress,
  walletClient,
  chainId,
}: UnlinkTransactionParameters): CustomTransactionIntent => {
  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  const writeParams = linkToRecordWriteParameters(
    walletClient as Parameters<typeof linkToRecordWriteParameters>[0],
    { sourceName, recordId: UNLINKED_RECORD_ID, resolverAddress },
  )

  return toEoaCustomIntent({
    from: walletClient.account.address,
    to: resolverAddress,
    data: encodeFunctionData({
      abi: writeParams.abi,
      functionName: writeParams.functionName,
      args: writeParams.args,
    } as Parameters<typeof encodeFunctionData>[0]),
    chainId,
  })
}

export interface UnlinkParameters extends UnlinkTransactionParameters {
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly id: string
}

export const unlink = async (
  params: UnlinkParameters,
): Promise<LinkRecordsResult> => {
  const { sourceName, publicClient, signer, chainId, id } = params

  const txId = transactionManager.startTransaction(
    prepareUnlinkTransaction(params),
    signer,
    { id, description: `Unlink ${sourceName}`, publicClient, chainId },
  )

  const result = await waitForTransaction(txId)
  return { txId, hash: result.hash }
}
