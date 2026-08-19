/**
 * Read the subregistry a parent registry currently holds for a label.
 *
 * This is the exact storage slot `setSubregistry` overwrites, read from the
 * registry itself rather than through the UniversalResolver or a cached query,
 * so a caller can prove the slot is still empty in the moment before writing to
 * it. Replacing a live pointer detaches the registry that was there along with
 * every subname inside it (WEB-1249).
 */

import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { permissionedRegistryGetSubregistrySnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { fromPromise, ok } from 'neverthrow'
import type { Address, ReadContractErrorType } from 'viem'
import { readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class ReadSubregistryError extends TaggedError('ReadSubregistryError')<{
  cause: ReadContractErrorType
}> {}

export type ReadSubregistryParameters = {
  /** The registry holding the label's entry — the parent of the name. */
  readonly registryAddress: Address
  readonly label: string
}

export const readSubregistry = ResultFn(async function* ({
  registryAddress,
  label,
}: ReadSubregistryParameters) {
  const client = yield* safeGetClient()

  const readContractAction = getAction(client, readContract, 'readContract')

  const subregistry = yield* fromPromise(
    readContractAction({
      address: registryAddress,
      abi: permissionedRegistryGetSubregistrySnippet,
      functionName: 'getSubregistry',
      args: [label],
    }),
    (e) => new ReadSubregistryError({ cause: e as ReadContractErrorType }),
  )

  return ok(subregistry as Address)
})
