import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  toHex,
  type WalletClient,
} from 'viem'
import { namehash, packetToBytes } from 'viem/ens'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'
import { permissionedResolverAbi } from '@/lib/abis/permissionedResolver'

/** DNS-encode a dotted name the way the resolver setters expect it. */
export const dnsEncodeName = (name: string): Hex => toHex(packetToBytes(name))

/** The record id that unlinks a name (`linkToRecord(name, 0)`). */
export const UNLINKED_RECORD_ID = 0n

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

  const data = encodeFunctionData({
    abi: permissionedResolverAbi,
    functionName: 'linkToNode',
    args: [dnsEncodeName(sourceName), namehash(targetName)],
  })

  return toEoaCustomIntent({
    from: walletClient.account.address,
    to: resolverAddress,
    data,
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
  const {
    sourceName,
    targetName,
    resolverAddress,
    walletClient,
    publicClient,
    signer,
    chainId,
    id,
  } = params

  const txId = transactionManager.startTransaction(
    prepareLinkToNodeTransaction({
      sourceName,
      targetName,
      resolverAddress,
      walletClient,
      chainId,
    }),
    signer,
    {
      id,
      description: `Link ${sourceName} to the records of ${targetName}`,
      publicClient,
      chainId,
    },
  )

  const result = await waitForTransaction(txId)

  return {
    txId,
    hash: result.hash,
  }
}

export interface UnlinkTransactionParameters {
  readonly sourceName: string
  readonly resolverAddress: Address
  readonly walletClient: WalletClient
  readonly chainId: number
}

/**
 * The `linkToRecord(name, 0)` intent, shared by the gas estimate and `unlink`.
 * An unlinked name reads the resolver's default record.
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

  const data = encodeFunctionData({
    abi: permissionedResolverAbi,
    functionName: 'linkToRecord',
    args: [dnsEncodeName(sourceName), UNLINKED_RECORD_ID],
  })

  return toEoaCustomIntent({
    from: walletClient.account.address,
    to: resolverAddress,
    data,
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
  const {
    sourceName,
    resolverAddress,
    walletClient,
    publicClient,
    signer,
    chainId,
    id,
  } = params

  const txId = transactionManager.startTransaction(
    prepareUnlinkTransaction({
      sourceName,
      resolverAddress,
      walletClient,
      chainId,
    }),
    signer,
    {
      id,
      description: `Unlink ${sourceName}`,
      publicClient,
      chainId,
    },
  )

  const result = await waitForTransaction(txId)

  return {
    txId,
    hash: result.hash,
  }
}
