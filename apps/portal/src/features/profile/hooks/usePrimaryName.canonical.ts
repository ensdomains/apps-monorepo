import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getName } from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'

class PrimaryNameError extends TaggedError('PrimaryNameError')<{
  cause: unknown
}> {}

const getPrimaryName = ResultFn(async function* (address: Address | undefined) {
  if (!address) return ok(null)

  const client = yield* safeGetClient()

  const result = yield* await fromPromise(
    getName(client, { address }),
    (e) => new PrimaryNameError({ cause: e }),
  )

  if (!result?.match) return ok(null)

  return ok(result.name)
})

const getPrimaryNameQueryKey = createQueryKey<
  'get-primary-name',
  { address: Address | undefined }
>('get-primary-name')

export const getPrimaryNameQueryOptions = (address: Address | undefined) =>
  resultQueryOptions({
    queryKey: getPrimaryNameQueryKey({ address }),
    queryFn: () => getPrimaryName(address),
    enabled: !!address,
  })
