import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getNameRegistryAddress as ensjs_getNameRegistryAddress,
  type GetNameRegistryAddressErrorType,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { namechainEthRegistryAddress } from '@/lib/constants/registry'
import { REGISTRY_CACHE } from '@/lib/query/cache'
import { safeGetNamechainSepoliaClient } from '@/lib/wagmi/helpers'

export type GetL2NameRegistriesParameters = {
  name: string
}

export type L2NameRegistriesResult = {
  rootRegistry: Address
  currentRegistry: Address | null
  parentRegistry: Address | null
  registries: readonly Address[]
  hasCurrentRegistry: boolean
}

class L2NameRegistriesError extends TaggedError('L2NameRegistriesError')<{
  cause: GetNameRegistryAddressErrorType
}> {}

/**
 * Walks the L2 registry hierarchy for a given .eth name using getNameRegistryAddress.
 *
 * For example, on L2:
 *  - flo.eth:
 *      labels = ["flo", "eth"]
 *      pathLabels = ["flo"]
 *      registries = [ registry("flo.eth") ]
 *      parentRegistry = namechainEthRegistryAddress (.eth registry on L2)
 *
 *  - test.flo.eth:
 *      labels = ["test", "flo", "eth"]
 *      pathLabels = ["test", "flo"]
 *      registries = [ registry("test.flo.eth"), registry("flo.eth") ]
 *      parentRegistry = registry("flo.eth")
 */
export const getL2NameRegistries = ResultFn(async function* (
  params: GetL2NameRegistriesParameters,
) {
  const client = yield* safeGetNamechainSepoliaClient()
  const { name } = params

  const labels = name.split('.')
  if (labels.length < 2) {
    return ok<L2NameRegistriesResult>({
      rootRegistry: namechainEthRegistryAddress,
      currentRegistry: null,
      parentRegistry: null,
      registries: [],
      hasCurrentRegistry: false,
    })
  }

  // Drop the TLD (eth) – we'll walk everything "under" .eth
  const pathLabels = labels.slice(0, -1) // e.g. ["flo"] or ["test", "flo"]

  // We walk from right to left under .eth
  // Example test.flo.eth:
  //   pathLabels        = ["test", "flo"]
  //   reversed          = ["flo", "test"]
  //   namechainEthRegistryAddress --flo--> flo.eth registry --test--> test.flo.eth registry
  const reversed = pathLabels.toReversed()

  let parentRegistry: Address = namechainEthRegistryAddress
  const registries: Address[] = []

  for (const label of reversed) {
    const registryAddress = yield* await fromPromise(
      ensjs_getNameRegistryAddress(client, {
        registryAddress: parentRegistry,
        label,
      }),
      (e) =>
        new L2NameRegistriesError({
          cause: e as GetNameRegistryAddressErrorType,
        }),
    )

    registries.unshift(registryAddress)

    if (registryAddress === zeroAddress) break
    parentRegistry = registryAddress
  }

  const currentRegistry = registries[0] ?? null
  const parentRegistryForName = registries[1] ?? namechainEthRegistryAddress
  const hasCurrentRegistry =
    !!currentRegistry && currentRegistry !== zeroAddress

  return ok<L2NameRegistriesResult>({
    rootRegistry: namechainEthRegistryAddress,
    currentRegistry,
    parentRegistry: parentRegistryForName,
    registries,
    hasCurrentRegistry,
  })
})

export const l2NameRegistriesQueryKey = createQueryKey<
  'l2NameRegistries',
  GetL2NameRegistriesParameters
>('l2NameRegistries')

export const getL2NameRegistriesQueryOptions = (
  params: GetL2NameRegistriesParameters,
) =>
  resultQueryOptions({
    queryKey: l2NameRegistriesQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getL2NameRegistries(params),
    ...REGISTRY_CACHE,
  })
