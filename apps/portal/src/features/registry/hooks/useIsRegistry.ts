import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { erc165SupportsInterfaceSnippet } from '@ensdomains/ensjs-abi/erc165'
import { fromPromise, ok } from 'neverthrow'
import type { Address, Hex, ReadContractErrorType } from 'viem'
import { readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'
import {
  hasErrorNamed,
  isContractRevert,
} from '@/utils/errors/isContractRevert'

/** ERC-165 id of `IRegistry`, which every registry reports, permissioned or not. */
const REGISTRY_INTERFACE_ID: Hex = '0x51f67f40'

// What viem throws when the address has no code to answer with.
const ZERO_DATA_ERROR_NAMES: ReadonlySet<string> = new Set([
  'ContractFunctionZeroDataError',
])

class GetIsRegistryError extends TaggedError('GetIsRegistryError')<{
  cause: ReadContractErrorType
}> {}

type GetIsRegistryParameters = {
  readonly address: Address
}

/**
 * Whether `address` reports `IRegistry`. No code or no ERC-165 answers `false`;
 * an unreachable RPC is an error (ensjs `getSupportedInterfaces` reads it as `false`).
 */
export const getIsRegistry = ResultFn(async function* ({
  address,
}: GetIsRegistryParameters) {
  const client = yield* safeGetClient()

  const isRegistry = yield* fromPromise(
    getAction(
      client,
      readContract,
      'readContract',
    )({
      address,
      abi: erc165SupportsInterfaceSnippet,
      functionName: 'supportsInterface',
      args: [REGISTRY_INTERFACE_ID],
    }).catch((error: unknown) => {
      if (
        isContractRevert(error) ||
        hasErrorNamed(error, ZERO_DATA_ERROR_NAMES)
      )
        return false
      throw error
    }),
    (e) =>
      new GetIsRegistryError({
        cause: e as ReadContractErrorType,
        message: 'Couldn’t reach the network to check it. Try again.',
      }),
  )

  return ok(isRegistry)
})

const getIsRegistryQueryKey = createQueryKey<
  'is-registry',
  GetIsRegistryParameters
>('is-registry')

export const getIsRegistryQueryOptions = (params: GetIsRegistryParameters) =>
  resultQueryOptions({
    queryKey: getIsRegistryQueryKey(params),
    queryFn: ({ queryKey: [, queryParams] }) => getIsRegistry(queryParams),
  })
