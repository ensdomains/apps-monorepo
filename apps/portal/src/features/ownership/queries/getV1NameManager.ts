import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { registryOwnerSnippet } from '@ensdomains/ensjs-abi/registry'
import { fromPromise, ok } from 'neverthrow'
import { type Address, namehash, type ReadContractErrorType } from 'viem'
import { readContract } from 'viem/actions'
import { normalize } from 'viem/ens'
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetV1NameManagerError extends TaggedError('GetV1NameManagerError')<{
  cause: ReadContractErrorType
}> {}

class NameNotNormalizableError extends TaggedError('NameNotNormalizableError')<{
  cause: unknown
}> {}

type GetV1NameManagerParameters = {
  readonly name: string
}

/**
 * The name's manager: the `owner` of its slot in the *legacy* registry, who
 * controls its resolver, its records and its subnames. For an unwrapped `.eth`
 * 2LD this is the controller, which can be a different wallet from the
 * registrant holding the ERC-721 — see `getV1NameState` for the full shape.
 *
 * Its own query (rather than a `useReadContract` inside the row that renders
 * it) so the reclaim flow can invalidate it by key once the role has moved.
 */
const getV1NameManager = ResultFn(async function* ({
  name: rawName,
}: GetV1NameManagerParameters) {
  // Route-supplied, so normalise before hashing — an unnormalised spelling
  // hashes to a different node than the one `getV1NameState` reads, which is
  // what gates the reclaim next to this row.
  const name = yield* fromSync(
    () => normalize(rawName),
    (e) => new NameNotNormalizableError({ cause: e }),
  )

  const client = yield* safeGetClient()

  const manager = yield* fromPromise(
    getAction(
      client,
      readContract,
      'readContract',
    )({
      address: getChainContractAddress({
        chain: client.chain,
        contract: 'ensLegacyRegistry',
      }),
      abi: registryOwnerSnippet,
      functionName: 'owner',
      args: [namehash(name)],
    }),
    (e) => new GetV1NameManagerError({ cause: e as ReadContractErrorType }),
  )

  return ok<Address>(manager)
})

const getV1NameManagerQueryKey = createQueryKey<
  'v1-name-manager',
  GetV1NameManagerParameters
>('v1-name-manager')

export const getV1NameManagerQueryOptions = (
  params: GetV1NameManagerParameters,
) =>
  resultQueryOptions({
    queryKey: getV1NameManagerQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getV1NameManager(params),
  })
