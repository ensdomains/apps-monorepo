/**
 * Delete Subname Helpers
 *
 * Pure functions for preparing deleteSubname transactions.
 */

import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { permissionedRegistryUnregisterSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import type { Address, WalletClient } from 'viem'
import { encodeFunctionData } from 'viem'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'
import {
  assertCalldataResourceId,
  type ResourceId,
} from '@/lib/resource/resourceId'

export interface PrepareDeleteSubnameParams {
  /** The parent registry (subregistry) address that manages this subname */
  readonly registryAddress: Address
  /**
   * The id of the subname to delete, as the indexer reported it for the row on
   * screen. Deliberately not a label: `unregister` takes the hashed id, and
   * re-hashing a displayed label would address a different name whenever that
   * label is written in encoded (`[<64 hex>]`) form (WEB-1458).
   */
  readonly resourceId: ResourceId
  /** The wallet client with account */
  readonly walletClient: WalletClient
  /** Chain ID */
  readonly chainId: number
  /** The full subname, used only in the refusal message of the preflight. */
  readonly subname?: string
}

/** The deleteSubname intent, shared by the gas estimate and {@link deleteSubname}. */
export function prepareDeleteSubnameTransaction({
  registryAddress,
  resourceId,
  walletClient,
  chainId,
  subname,
}: PrepareDeleteSubnameParams): CustomTransactionIntent {
  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  const data = encodeFunctionData({
    abi: permissionedRegistryUnregisterSnippet,
    functionName: 'unregister',
    args: [resourceId],
  })

  assertCalldataResourceId({
    abi: permissionedRegistryUnregisterSnippet,
    data,
    expected: resourceId,
    action: `Deleting ${subname ?? 'this subname'}`,
  })

  return toEoaCustomIntent({
    from: walletClient.account.address,
    to: registryAddress,
    data,
    chainId,
  })
}
