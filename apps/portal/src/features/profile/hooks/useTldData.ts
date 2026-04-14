import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { universalResolverFindRegistriesSnippet } from '@ensdomains/ensjs-abi/universalResolver'
import { permissionedRegistryGetStateSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { fromPromise, ok } from 'neverthrow'
import { type Address, labelhash, zeroAddress } from 'viem'
import { multicall } from 'viem/actions'
import { packetToBytes } from 'viem/ens'
import { getAction, toHex } from 'viem/utils'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetTldDataError extends TaggedError('GetTldDataError')<{
  cause: Error
}> {}

export type GetTldDataReturnType = {
  owner: Address | null
  protocolVersion: 'ENSv2'
  registryAddress: Address | null
}

const v2RootRegistry = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})

const universalResolver = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensUniversalResolver',
})

type GetTldDataParameters = {
  tld: string
}

export const getTldData = ResultFn(async function* ({
  tld,
}: GetTldDataParameters) {
  const client = yield* safeGetClient()

  const multicallAction = getAction(client, multicall, 'multicall')

  const results = yield* fromPromise(
    multicallAction({
      contracts: [
        {
          address: v2RootRegistry,
          abi: permissionedRegistryGetStateSnippet,
          functionName: 'getState',
          args: [BigInt(labelhash(tld))],
        },
        {
          address: universalResolver,
          abi: universalResolverFindRegistriesSnippet,
          functionName: 'findRegistries',
          args: [toHex(packetToBytes(tld))],
        },
      ],
      allowFailure: true,
    }),
    (e) => new GetTldDataError({ cause: e as Error }),
  )

  const [stateResult, registriesResult] = results

  const owner =
    stateResult.status === 'success'
      ? (stateResult.result as { latestOwner: Address }).latestOwner ===
        zeroAddress
        ? null
        : (stateResult.result as { latestOwner: Address }).latestOwner
      : null

  // findRegistries returns an array of registry addresses in the ancestry
  // The last entry is the TLD's own registry (if it has one)
  const registries =
    registriesResult.status === 'success'
      ? (registriesResult.result as readonly Address[])
      : []

  // The TLD registry is the last one in the array (beyond the root)
  const registryAddress =
    registries.length > 1 && registries[registries.length - 1] !== zeroAddress
      ? registries[registries.length - 1]
      : null

  return ok<GetTldDataReturnType>({
    owner,
    protocolVersion: 'ENSv2',
    registryAddress,
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
