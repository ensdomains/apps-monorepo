import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getOwner as ensjsv2_getOwner } from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { zeroAddress } from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { normalizeEthName } from './profileName'

class GetOwnerError extends TaggedError('GetOwnerError')<{
  cause: unknown
}> {}

export const getOwner = ResultFn(async function* (params: { name: string }) {
  const ethName = normalizeEthName(params.name)

  if (!ethName) {
    return ok(null)
  }

  const client = yield* safeGetClient()

  const owner = yield* fromPromise(
    ensjsv2_getOwner(client, { name: ethName.name }),
    (e) => new GetOwnerError({ cause: e }),
  )

  if (owner && owner !== zeroAddress) {
    return ok({ owner })
  }

  return ok(null)
})

export const profileOwnerQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'owner', { name }),
    queryFn: () => getOwner({ name }),
  })
