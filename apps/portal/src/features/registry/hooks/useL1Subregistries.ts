import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { sepoliaEthRegistryAddress } from '@/lib/constants/registry'
import { REGISTRY_CACHE } from '@/lib/query/cache'
import { isZeroAddress } from '@/lib/utils'
import { getNameRegistry } from './useNameRegistry'

export type GetL1NameRegistriesParameters = {
  name: string
}

export type L1NameRegistriesResult = {
  rootRegistry: Address
  currentRegistry: Address | null
  parentRegistry: Address | null
  registries: readonly Address[]
  hasCurrentRegistry: boolean
}

/**
 * Walks the L1 registry hierarchy for a given .eth name.
 *
 * Starts from sepoliaEthRegistryAddress and walks labels right-to-left.
 * Uses getNameRegistry under the hood, which checks L1 first and
 * falls back to Namechain if needed.
 *
 * For example, on L1:
 *  - flo.eth:
 *      labels = ["flo", "eth"]
 *      pathLabels = ["flo"]
 *      registries = [ registry("flo.eth") ]
 *      parentRegistry = sepoliaEthRegistryAddress (.eth registry on L1)
 *
 *  - test.flo.eth:
 *      labels = ["test", "flo", "eth"]
 *      pathLabels = ["test", "flo"]
 *      registries = [ registry("test.flo.eth"), registry("flo.eth") ]
 *      parentRegistry = registry("flo.eth")
 */
export const getL1NameRegistries = ResultFn(async function* (
  params: GetL1NameRegistriesParameters,
) {
  const { name } = params

  const labels = name.split('.')
  if (labels.length < 2) {
    return ok<L1NameRegistriesResult>({
      rootRegistry: sepoliaEthRegistryAddress,
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
  //   sepoliaEthRegistryAddress --flo--> flo.eth registry --test--> test.flo.eth registry
  const reversed = pathLabels.toReversed()

  let parentRegistry: Address = sepoliaEthRegistryAddress
  const registries: Address[] = []

  for (const label of reversed) {
    const result = yield* getNameRegistry({
      registryAddress: parentRegistry,
      label,
    })

    const registryAddress = result.registryAddress as Address
    registries.unshift(registryAddress)

    if (isZeroAddress(registryAddress)) break
    parentRegistry = registryAddress
  }

  const currentRegistry = registries[0] ?? null
  const parentRegistryForName = registries[1] ?? sepoliaEthRegistryAddress
  const hasCurrentRegistry =
    !!currentRegistry && !isZeroAddress(currentRegistry)

  return ok<L1NameRegistriesResult>({
    rootRegistry: sepoliaEthRegistryAddress,
    currentRegistry,
    parentRegistry: parentRegistryForName,
    registries,
    hasCurrentRegistry,
  })
})

export const l1NameRegistriesQueryKey = createQueryKey<
  'l1NameRegistries',
  GetL1NameRegistriesParameters
>('l1NameRegistries')

export const getL1NameRegistriesQueryOptions = (
  params: GetL1NameRegistriesParameters,
) =>
  resultQueryOptions({
    queryKey: l1NameRegistriesQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getL1NameRegistries(params),
    ...REGISTRY_CACHE,
  })
