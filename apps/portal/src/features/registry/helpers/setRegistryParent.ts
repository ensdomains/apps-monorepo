/**
 * Records a freshly deployed registry's canonical parent (`setParent`), so
 * the indexer names its subnames after the name that deployed it even if
 * another name later links the same registry.
 */

import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import { encodeFunctionData, parseAbi } from 'viem'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'
import { isEncodedLabelhash } from '@/utils/token/isNormalized'

export const REGISTRY_SET_PARENT_ABI = parseAbi([
  'function setParent(address parent, string label)',
])

/** The label `setParent` records for `name`, or `null` when it is encoded. */
export const registryParentLabel = (name: string): string | null => {
  const label = name.split('.')[0]
  if (!label || isEncodedLabelhash(label)) return null
  return label
}

export interface SetRegistryParentTransactionParameters {
  readonly registry: Address
  readonly parentRegistry: Address
  /** The name's own label, never an encoded `[<labelhash>]`. */
  readonly label: string
  readonly walletClient: WalletClient
  readonly chainId: number
}

export interface SetRegistryParentParameters
  extends SetRegistryParentTransactionParameters {
  readonly name: string
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly id: string
}

export interface SetRegistryParentResult {
  readonly txId: string
  readonly hash: Hex
}

export const prepareSetRegistryParentTransaction = ({
  registry,
  parentRegistry,
  label,
  walletClient,
  chainId,
}: SetRegistryParentTransactionParameters): CustomTransactionIntent => {
  if (!walletClient.account) {
    throw new Error('Wallet client must have account configured')
  }

  return toEoaCustomIntent({
    from: walletClient.account.address,
    to: registry,
    data: encodeFunctionData({
      abi: REGISTRY_SET_PARENT_ABI,
      functionName: 'setParent',
      args: [parentRegistry, label],
    }),
    chainId,
  })
}

export const setRegistryParent = async ({
  name,
  publicClient,
  signer,
  id,
  ...params
}: SetRegistryParentParameters): Promise<SetRegistryParentResult> => {
  const txId = transactionManager.startTransaction(
    prepareSetRegistryParentTransaction(params),
    signer,
    {
      id,
      description: `Set registry parent for ${name}`,
      publicClient,
      timeout: 120_000,
    },
  )

  const result = await waitForTransaction(txId)

  return { txId, hash: result.hash }
}
