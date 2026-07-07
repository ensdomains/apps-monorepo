import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { resolveAddressOrName } from '@/features/roles/helpers/addUser.handlers'
import { safeGetClient } from '@/lib/wagmi/helpers'

interface GetRecipientAddressParams {
  readonly nameOrAddress: string
}

/**
 * Resolve a recipient input (an ENS name or a 0x address) to an address.
 * Addresses pass through; names go through the universal resolver, falling
 * back to the ENS owner when the name has no address record.
 */
export const getRecipientAddress = ResultFn(async function* (
  params: GetRecipientAddressParams,
) {
  const client = yield* safeGetClient()

  // `resolveAddressOrName` resolves to `Address | null` and never throws (it
  // swallows resolution failures to null), so there's nothing to wrap in a
  // Result error here.
  const address = await resolveAddressOrName({
    client,
    nameOrAddress: params.nameOrAddress,
  })

  return ok<Address | null>(address)
})

const getRecipientAddressQueryKey = createQueryKey<
  'recipient-address',
  GetRecipientAddressParams
>('recipient-address')

export const getRecipientAddressQueryOptions = (
  params: GetRecipientAddressParams,
) =>
  resultQueryOptions({
    queryKey: getRecipientAddressQueryKey(params),
    queryFn: ({ queryKey: [, queryParams] }) =>
      getRecipientAddress(queryParams),
  })
