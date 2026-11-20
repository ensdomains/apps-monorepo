import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { userRegistryRenewSnippet } from '@ensdomains/ensjs-abi/v2/userRegistry'
import { type Address, encodeFunctionData, type WalletClient } from 'viem'
import { toEoaIntent } from '@/features/transaction-manager/helpers/intents'
import {
  assertCalldataResourceId,
  type ResourceId,
} from '@/lib/resource/resourceId'

export interface PrepareExtendSubnameExpiryParams {
  /** The parent subregistry that holds the subname */
  readonly registryAddress: Address
  /** The subname's id as the indexer reported it for the row, never a re-hashed label (WEB-1458). */
  readonly resourceId: ResourceId
  /** The new registry expiry; `renew` reverts unless it is later than the current one. */
  readonly expires: bigint
  readonly walletClient: WalletClient
  readonly chainId: number
  /** The full subname, used only in the refusal message of the preflight. */
  readonly subname: string
}

/** The `renew` intent that moves a subname's expiry later, shared by the gas estimate and the send. */
export function prepareExtendSubnameExpiryTransaction({
  registryAddress,
  resourceId,
  expires,
  walletClient,
  chainId,
  subname,
}: PrepareExtendSubnameExpiryParams): CustomTransactionIntent {
  // Every PermissionedRegistry has `renew`; ensjs-abi ships the snippet under UserRegistry.
  const data = encodeFunctionData({
    abi: userRegistryRenewSnippet,
    functionName: 'renew',
    args: [resourceId, expires],
  })

  assertCalldataResourceId({
    abi: userRegistryRenewSnippet,
    data,
    expected: resourceId,
    action: `Changing the expiration of ${subname}`,
  })

  return toEoaIntent(walletClient, { to: registryAddress, data, chainId })
}
