import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { getIndexerDomain } from './getIndexerDomain'

export const getOwner = ResultFn(async function* (params: { name: string }) {
  const domain = yield* getIndexerDomain(params.name)

  if (domain?.owner?.id && domain.owner.id !== zeroAddress) {
    return ok({
      owner: domain.owner.id as Address,
    })
  }

  return ok(null)
})

export const profileOwnerQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'owner', { name }),
    queryFn: () => getOwner({ name }),
  })
