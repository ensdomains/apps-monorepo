import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import type { ResourceId } from '@/lib/resource/resourceId'
import { prepareExtendSubnameExpiryTransaction } from '../utils/extend-subname-expiry.helpers'

export interface ExtendSubnameExpiryParameters {
  /** The full subname, for the transaction description */
  readonly name: string
  readonly resourceId: ResourceId
  readonly registryAddress: Address
  readonly expires: bigint
  /** Transaction id used by transactionManager and TransactionModal */
  readonly id: string
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
}

/** Starts the subname's `renew` through the transaction manager and waits for it. */
export const extendSubnameExpiry = async ({
  name,
  resourceId,
  registryAddress,
  expires,
  id,
  walletClient,
  publicClient,
  signer,
  chainId,
}: ExtendSubnameExpiryParameters): Promise<{ readonly hash: Hex }> => {
  const intent = prepareExtendSubnameExpiryTransaction({
    registryAddress,
    resourceId,
    expires,
    walletClient,
    chainId,
    subname: name,
  })

  const txId = transactionManager.startTransaction(intent, signer, {
    id,
    description: `Change the expiration of ${name}`,
    publicClient,
    chainId,
  })

  const { hash } = await waitForTransaction(txId)
  return { hash }
}
