import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { fromPromise, ok } from 'neverthrow'
import { type Address, parseAbi } from 'viem'
import { type ReadContractErrorType, readContract } from 'viem/actions'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { resolveCanonicalRegistry } from '../utils/canonicalRegistry'

// ensjs's `ensRegistry` is the `.eth` registry (its getParent() is
// (root, "eth") and root.getSubregistry("eth") points back at it). ensjs has
// no entry for the root, so the root is read off that parent pointer.
const ETH_REGISTRY = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})

const registryGetParentAbi = parseAbi([
  'function getParent() view returns (address registry, string label)',
])

class GetCanonicalRegistryError extends TaggedError(
  'GetCanonicalRegistryError',
)<{
  cause: ReadContractErrorType
}> {}

type GetCanonicalRegistryParameters = {
  readonly address: Address
}

const getCanonicalRegistry = ResultFn(async function* ({
  address,
}: GetCanonicalRegistryParameters) {
  const client = yield* safeGetClient()

  const result = yield* fromPromise(
    readContract(client, {
      address: ETH_REGISTRY,
      abi: registryGetParentAbi,
      functionName: 'getParent',
    }).then(([root]) => resolveCanonicalRegistry(client, { address, root })),
    (e) => new GetCanonicalRegistryError({ cause: e as ReadContractErrorType }),
  )

  return ok(result)
})

const getCanonicalRegistryQueryKey = createQueryKey<
  'get-canonical-registry',
  GetCanonicalRegistryParameters
>('get-canonical-registry')

export const getCanonicalRegistryQueryOptions = (
  params: GetCanonicalRegistryParameters,
) =>
  resultQueryOptions({
    queryKey: getCanonicalRegistryQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getCanonicalRegistry(params),
  })
