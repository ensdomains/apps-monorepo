import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { universalResolverFindRegistriesSnippet } from '@ensdomains/ensjs-abi/universalResolver'
import { permissionedRegistryGetStateSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { fromPromise, ok } from 'neverthrow'
import { type Address, labelhash, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { packetToBytes } from 'viem/ens'
import { getAction, toHex } from 'viem/utils'
import { universalResolverAddress } from '@/lib/constants/universalResolver'
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

type TldRegistries = readonly [
  registryAddress: Address,
  rootRegistryAddress: Address,
]

type GetTldDataParameters = {
  tld: string
}

export const getTldData = ResultFn<GetTldDataReturnType, GetTldDataError>(
  async function* ({
    tld,
  }: GetTldDataParameters): Promise<GetTldDataReturnType> {
    const client = yield* safeGetClient()

    const readContractAction = getAction(client, readContract, 'readContract')

    const registries = yield* fromPromise(
      readContractAction({
        address: universalResolverAddress,
        abi: universalResolverFindRegistriesSnippet,
        functionName: 'findRegistries',
        args: [toHex(packetToBytes(tld))],
      }),
      (e) => new GetTldDataError({ cause: e as Error }),
    ) as TldRegistries

    // findRegistries returns an array of registry addresses in the ancestry
    // For TLDs this is [tldRegistry, rootRegistry]
    const [registryAddress, rootRegistryAddress] = registries

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

    return ok<GetTldDataReturnType>({
      owner,
      protocolVersion: 'ENSv2',
      registryAddress,
      rootRegistryAddress,
    })
  },
)

const getTldDataQueryKey = createQueryKey<'get-tld-data', GetTldDataParameters>(
  'get-tld-data',
)

export const getTldDataQueryOptions = (params: GetTldDataParameters) =>
  resultQueryOptions<GetTldDataReturnType, GetTldDataError>({
    queryKey: getTldDataQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getTldData(params),
  })
