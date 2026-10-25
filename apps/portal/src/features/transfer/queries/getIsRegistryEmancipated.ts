import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import { type Address, parseAbi, type ReadContractErrorType } from 'viem'
import { readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'

// `IPermissionedRegistry.isEmancipated`, which ensjs-abi doesn't export yet.
const isEmancipatedAbi = parseAbi([
  'function isEmancipated() view returns (bool)',
])

export class GetIsRegistryEmancipatedError extends TaggedError(
  'GetIsRegistryEmancipatedError',
)<{
  cause: ReadContractErrorType
}> {}

/**
 * Whether no account holds a root role on the registry that can still reach
 * its names. `safeTransferFrom` reverts with
 * `TransferUnsafeUntilRegistryIsEmancipated` otherwise, which is the normal
 * state of a subregistry whose parent owner kept its root roles.
 */
export const getIsRegistryEmancipated = ResultFn(async function* ({
  registryAddress,
}: {
  /** The registry the name's token lives in (its parent's subregistry). */
  readonly registryAddress: Address
}) {
  const client = yield* safeGetClient()

  const isEmancipated = yield* fromPromise(
    getAction(
      client,
      readContract,
      'readContract',
    )({
      address: registryAddress,
      abi: isEmancipatedAbi,
      functionName: 'isEmancipated',
    }),
    (e) =>
      new GetIsRegistryEmancipatedError({
        cause: e as ReadContractErrorType,
        message: 'Couldn’t check that the transfer would succeed. Try again.',
      }),
  )

  return ok(isEmancipated)
})
