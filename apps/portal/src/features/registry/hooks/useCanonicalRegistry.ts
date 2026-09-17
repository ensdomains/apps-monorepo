import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { fromPromise, ok } from 'neverthrow'
import { type Address, type Client, parseAbi } from 'viem'
import { readContract } from 'viem/actions'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import {
  type CanonicalRegistryReads,
  resolveCanonicalName,
  resolveCanonicalParent,
} from '../utils/canonicalRegistry'

// IRegistry: the minimal interface every v2 registry implements.
const registryParentAbi = parseAbi([
  'function getParent() view returns (address registry, string label)',
  'function getSubregistry(string label) view returns (address)',
])

// ensjs names the `.eth` registry `ensRegistry`; the root above it has no
// entry, so it is read off the `.eth` registry's own parent pointer.
const ETH_REGISTRY = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})

const chainReads = (client: Client): CanonicalRegistryReads => ({
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
})

type RegistryParameters = {
  readonly address: Address
}

class GetCanonicalParentError extends TaggedError('GetCanonicalParentError')<{
  cause: unknown
}> {}

const getCanonicalParent = ResultFn(async function* ({
  address,
}: RegistryParameters) {
  const client = yield* safeGetClient()
  const parent = yield* fromPromise(
    resolveCanonicalParent(address, chainReads(client)),
    (e) => new GetCanonicalParentError({ cause: e }),
  )
  return ok(parent)
})

const canonicalParentQueryKey = createQueryKey<
  'get-canonical-parent',
  RegistryParameters
>('get-canonical-parent')

export const getCanonicalParentQueryOptions = (params: RegistryParameters) =>
  resultQueryOptions({
    queryKey: canonicalParentQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getCanonicalParent(params),
  })

class GetCanonicalNameError extends TaggedError('GetCanonicalNameError')<{
  cause: unknown
}> {}

const getCanonicalName = ResultFn(async function* ({
  address,
}: RegistryParameters) {
  const client = yield* safeGetClient()
  const reads = chainReads(client)
  const name = yield* fromPromise(
    reads
      .readParent(ETH_REGISTRY)
      .then((root) => resolveCanonicalName(address, reads, root.registry)),
    (e) => new GetCanonicalNameError({ cause: e }),
  )
  return ok(name)
})

const canonicalNameQueryKey = createQueryKey<
  'get-canonical-name',
  RegistryParameters
>('get-canonical-name')

export const getCanonicalNameQueryOptions = (params: RegistryParameters) =>
  resultQueryOptions({
    queryKey: canonicalNameQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getCanonicalName(params),
  })
