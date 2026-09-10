import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { permissionedRegistryGetResolverSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { fromPromise, ok } from 'neverthrow'
import { type Address, type ReadContractErrorType, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetOwnResolverError extends TaggedError('GetOwnResolverError')<{
  cause: ReadContractErrorType
}> {}

type GetOwnResolverParameters = {
  readonly label: string
  /** The registry the name's token lives in (its parent's subregistry). */
  readonly registryAddress: Address
}

/**
 * The resolver set on the name's *own* registry slot, or null if it has none.
 *
 * Deliberately not `getResolver` from `@ensdomains/ensjs/public`: that goes
 * through the UniversalResolver and returns the resolver a name *effectively*
 * resolves through, walking up to an ancestor when the name has none of its own.
 * For a 2LD the two nearly always agree, but for a subname the effective
 * resolver is commonly the parent's — and the transfer flow must not treat an
 * inherited resolver as something the sender can detach or write to:
 *
 * - The `detach-resolver` step writes `registry.setResolver(label, 0)` on this exact
 *   slot, so offering the option off an inherited resolver produces a no-op
 *   transaction while the name keeps resolving through its parent.
 * - The `set-eth-addr` step would write the name's `addr(60)` onto the *parent's*
 *   resolver, which the sender keeps after the transfer (or, more often, isn't
 *   authorized on — reverting mid-plan, before the token has moved).
 *
 * Reading the same slot the write targets keeps the two in agreement.
 */
const getOwnResolver = ResultFn(async function* ({
  label,
  registryAddress,
}: GetOwnResolverParameters) {
  const client = yield* safeGetClient()

  const resolver = yield* fromPromise(
    getAction(
      client,
      readContract,
      'readContract',
    )({
      address: registryAddress,
      abi: permissionedRegistryGetResolverSnippet,
      functionName: 'getResolver',
      args: [label],
    }),
    (e) => new GetOwnResolverError({ cause: e as ReadContractErrorType }),
  )

  return ok<Address | null>(resolver === zeroAddress ? null : resolver)
})

const getOwnResolverQueryKey = createQueryKey<
  'transfer-own-resolver',
  GetOwnResolverParameters
>('transfer-own-resolver')

export const getOwnResolverQueryOptions = (params: GetOwnResolverParameters) =>
  resultQueryOptions({
    queryKey: getOwnResolverQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getOwnResolver(params),
  })
