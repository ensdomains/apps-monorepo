import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok } from 'neverthrow'
import { checkRealNameAvailability } from './realEnsContractService'

export class NameAvailabilityError extends TaggedError(
  'NameAvailabilityError',
)<{
  cause: unknown
}> {}

export const checkNameAvailabilityService = ResultFn(async function* (
  name: string,
) {
  const nameWithEth = name.endsWith('.eth') ? name : `${name}.eth`

  // Use real contract for local development
  const result = yield* checkRealNameAvailability(nameWithEth)

  return ok(result)
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
    queryFn: () => checkNameAvailabilityService(name),
  })
