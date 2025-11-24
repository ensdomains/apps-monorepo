import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getNameRegistryAddress as ensjs_getNameRegistryAddress,
  type GetNameRegistryAddressErrorType,
} from '@ensdomains/ensjs/public/v2'
import { useQuery } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { L2_ETH_REGISTRY } from '@/lib/constants/registry'
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
 *      parentRegistry = L2_ETH_REGISTRY (.eth registry on L2)
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
    return ok({
      rootRegistry: L2_ETH_REGISTRY,
      currentRegistry: null,
      parentRegistry: null,
      registries: [] as Address[],
      hasCurrentRegistry: false,
    } satisfies L2NameRegistriesResult)
  }

  // Drop the TLD (eth) – we'll walk everything "under" .eth
  const pathLabels = labels.slice(0, -1) // e.g. ["flo"] or ["test", "flo"]

  // We walk from right to left under .eth
  // Example test.flo.eth:
  //   pathLabels        = ["test", "flo"]
  //   reversed          = ["flo", "test"]
  //   L2_ETH_REGISTRY --flo--> flo.eth registry --test--> test.flo.eth registry
  const reversed = [...pathLabels].reverse()

  let parentRegistry: Address = L2_ETH_REGISTRY
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

    if (registryAddress === zeroAddress) {
      break
    }

    parentRegistry = registryAddress
  }

  const currentRegistry = registries[0] ?? null
  const parentRegistryForName = registries[1] ?? L2_ETH_REGISTRY // for 2LDs, parent is the L2 .eth registry

  const hasCurrentRegistry =
    !!currentRegistry && currentRegistry !== zeroAddress

  return ok({
    rootRegistry: L2_ETH_REGISTRY,
    currentRegistry,
    parentRegistry: parentRegistryForName,
    registries,
    hasCurrentRegistry,
  } satisfies L2NameRegistriesResult)
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

export type UseL2SubregistriesParams = {
  name: string
  enabled?: boolean
}

export type UseL2SubregistriesReturn = {
  rootRegistry: Address | null
  currentRegistry: Address | null
  parentRegistry: Address | null
  subregistries: readonly Address[]
  hasCurrentRegistry: boolean
  isLoading: boolean
  error: Error | null
}

/**
 * L2 equivalent of useNameSubregistries, using getNameRegistryAddress
 * to walk the hierarchy under the L2 .eth registry.
 */
export function useL2Subregistries({
  name,
  enabled = true,
}: UseL2SubregistriesParams): UseL2SubregistriesReturn {
  const { data, isLoading, error } = useQuery({
    ...getL2NameRegistriesQueryOptions({ name }),
    enabled,
    placeholderData: (prev) => prev,
  })

  const result = data as L2NameRegistriesResult | undefined

  const rootRegistry = result?.rootRegistry ?? L2_ETH_REGISTRY
  const currentRegistry = result?.currentRegistry ?? null
  const parentRegistry = result?.parentRegistry ?? null
  const subregistries = (result?.registries ?? []) as readonly Address[]
  const hasCurrentRegistry = result?.hasCurrentRegistry ?? false

  return {
    rootRegistry,
    currentRegistry,
    parentRegistry,
    subregistries,
    hasCurrentRegistry,
    isLoading,
    error: error as Error | null,
  }
}
