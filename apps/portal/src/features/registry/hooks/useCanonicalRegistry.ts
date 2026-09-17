import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import { type Address, parseAbi } from 'viem'
import { readContract } from 'viem/actions'
import { safeGetClient } from '@/lib/wagmi/helpers'
import {
  type CanonicalRegistry,
  resolveCanonicalRegistry,
} from '../utils/canonicalRegistry'

// IRegistry: the minimal interface every v2 registry implements.
const registryParentAbi = parseAbi([
  'function getParent() view returns (address registry, string label)',
  'function getSubregistry(string label) view returns (address)',
])

class GetCanonicalRegistryError extends TaggedError(
  'GetCanonicalRegistryError',
)<{
  cause: unknown
}> {}

type GetCanonicalRegistryParameters = {
  readonly address: Address
}

const getCanonicalRegistry = ResultFn(async function* ({
  address,
}: GetCanonicalRegistryParameters) {
  const client = yield* safeGetClient()

  const result = yield* fromPromise(
    resolveCanonicalRegistry(address, {
      readParent: async (registry) => {
        const [parent, label] = await readContract(client, {
          address: registry,
          abi: registryParentAbi,
          functionName: 'getParent',
        })
        return { registry: parent, label }
      },
      readSubregistry: (registry, label) =>
        readContract(client, {
          address: registry,
          abi: registryParentAbi,
          functionName: 'getSubregistry',
          args: [label],
        }),
    }),
    (e) => new GetCanonicalRegistryError({ cause: e }),
  )

  return ok<CanonicalRegistry>(result)
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
