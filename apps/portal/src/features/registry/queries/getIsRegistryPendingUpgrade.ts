import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { getStorageAt } from 'viem/actions'
import { isPendingUpgradeImplementation } from '@/features/registry/utils/pendingUpgradeRegistry'
import {
  decodeImplementationAddress,
  EIP1967_IMPLEMENTATION_SLOT,
} from '@/features/resolver/utils/permissionedResolver'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetIsRegistryPendingUpgradeError extends TaggedError(
  'GetIsRegistryPendingUpgradeError',
)<{
  cause: unknown
}> {}

type GetIsRegistryPendingUpgradeParameters = {
  readonly registryAddress: Address
}

const getIsRegistryPendingUpgrade = ResultFn(async function* ({
  registryAddress,
}: GetIsRegistryPendingUpgradeParameters) {
  const client = yield* safeGetClient()

  const slotValue = yield* fromPromise(
    getStorageAt(client, {
      address: registryAddress,
      slot: EIP1967_IMPLEMENTATION_SLOT,
    }),
    (cause) => new GetIsRegistryPendingUpgradeError({ cause }),
  )

  return ok(
    isPendingUpgradeImplementation({
      chainId: client.chain.id,
      implementation: decodeImplementationAddress(slotValue),
    }),
  )
})

const getIsRegistryPendingUpgradeQueryKey = createQueryKey<
  'is-registry-pending-upgrade',
  GetIsRegistryPendingUpgradeParameters
>('is-registry-pending-upgrade')

export const getIsRegistryPendingUpgradeQueryOptions = (
  params: GetIsRegistryPendingUpgradeParameters,
) =>
  resultQueryOptions({
    queryKey: getIsRegistryPendingUpgradeQueryKey(params),
    queryFn: ({ queryKey: [, queryParams] }) =>
      getIsRegistryPendingUpgrade(queryParams),
    // An upgrade to a fixed implementation lifts the safeguard, so each mount reads afresh.
    staleTime: 0,
  })
