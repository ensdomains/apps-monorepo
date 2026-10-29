import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { getStorageAt } from 'viem/actions'
import { isUntrustedRegistryImplementation } from '@/features/registry/utils/untrustedRegistry'
import {
  decodeImplementationAddress,
  EIP1967_IMPLEMENTATION_SLOT,
} from '@/features/resolver/utils/permissionedResolver'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetIsUntrustedRegistryError extends TaggedError(
  'GetIsUntrustedRegistryError',
)<{
  cause: unknown
}> {}

type GetIsUntrustedRegistryParameters = {
  readonly address: Address
}

/** Whether `address` currently delegates to an untrusted UserRegistry implementation. */
const getIsUntrustedRegistry = ResultFn(async function* ({
  address,
}: GetIsUntrustedRegistryParameters) {
  const client = yield* safeGetClient()

  const slotValue = yield* fromPromise(
    getStorageAt(client, { address, slot: EIP1967_IMPLEMENTATION_SLOT }),
    (cause) => new GetIsUntrustedRegistryError({ cause }),
  )

  return ok(
    isUntrustedRegistryImplementation({
      chainId: client.chain.id,
      implementation: decodeImplementationAddress(slotValue),
    }),
  )
})

const getIsUntrustedRegistryQueryKey = createQueryKey<
  'is-untrusted-registry',
  GetIsUntrustedRegistryParameters
>('is-untrusted-registry')

export const getIsUntrustedRegistryQueryOptions = (
  params: GetIsUntrustedRegistryParameters,
) =>
  resultQueryOptions({
    queryKey: getIsUntrustedRegistryQueryKey(params),
    queryFn: ({ queryKey: [, queryParams] }) =>
      getIsUntrustedRegistry(queryParams),
  })
