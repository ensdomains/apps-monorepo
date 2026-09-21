import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getNameRegistries } from '@ensdomains/ensjs/public/v2'
import { permissionedRegistryGetStateSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { fromPromise, ok } from 'neverthrow'
import { type Address, labelhash, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetTldDataError extends TaggedError('GetTldDataError')<{
  cause: Error
}> {}

export type GetTldDataReturnType = {
  owner: Address | null
  protocolVersion: 'ENSv2'
  registryAddress: Address
  rootRegistryAddress: Address
}

type GetTldDataParameters = {
  tld: string
}

export const getTldData = ResultFn(async function* ({ tld }) {
  const client = yield* safeGetClient()

  const readContractAction = getAction(client, readContract, 'readContract')

  // `findRegistries` on the UniversalHelper (ensjs resolves the address from
  // the chain's `ensUniversalHelper` contract).
  const registries = yield* fromPromise(
    getNameRegistries(client, { name: tld }),
    (e) => new GetTldDataError({ cause: e as Error }),
  )

  if (!registries || registries.length < 2) {
    return ok({
      owner: null,
      protocolVersion: 'ENSv2' as const,
      registryAddress: zeroAddress,
      rootRegistryAddress: zeroAddress,
    })
  }

  const registryAddress = registries[0]
  const rootRegistryAddress = registries[1]

  const state = yield* fromPromise(
    readContractAction({
      address: rootRegistryAddress,
      abi: permissionedRegistryGetStateSnippet,
      functionName: 'getState',
      args: [BigInt(labelhash(tld))],
    }),
    (e) => new GetTldDataError({ cause: e as Error }),
  )

  const owner = state.latestOwner !== zeroAddress ? state.latestOwner : null

  return ok({
    owner,
    protocolVersion: 'ENSv2' as const,
    registryAddress,
    rootRegistryAddress,
  })
})

const getTldDataQueryKey = createQueryKey<'get-tld-data', GetTldDataParameters>(
  'get-tld-data',
)

export const getTldDataQueryOptions = (params: GetTldDataParameters) =>
  resultQueryOptions({
    queryKey: getTldDataQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getTldData(params),
  })
