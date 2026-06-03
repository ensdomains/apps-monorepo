import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getAvailable } from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class NameAvailabilityError extends TaggedError(
  'NameAvailabilityError',
)<{
  cause: unknown
}> {}

export const checkNameAvailability = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()

  const cleanName = name.replace(/\.eth$/i, '')
  const nameWithEth = `${cleanName}.eth`
  const isAvailable = yield* await fromPromise(
    getAvailable(client, { name: nameWithEth }),
    (e) => new NameAvailabilityError({ cause: e }),
  )

  return ok({
    isAvailable,
    name: nameWithEth,
  })
})

export const searchNameQueryKey = createQueryKey<
  'searchName',
  {
    name: string
  }
>('searchName')

export const getSearchNameQueryOptions = (name: string) =>
  resultQueryOptions({
    queryKey: searchNameQueryKey({ name }),
    queryFn: ({ queryKey: [, { name }] }) => checkNameAvailability(name),
  })
