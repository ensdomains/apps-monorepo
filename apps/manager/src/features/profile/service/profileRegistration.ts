import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok } from 'neverthrow'
import { getIndexerDomain } from './getIndexerDomain'

export const getRegistration = ResultFn(async function* (name: string) {
  const domain = yield* getIndexerDomain(name)

  if (!domain) {
    return ok({ registrationDate: undefined as unknown as number })
  }

  return ok({
    registrationDate: domain.createdAt,
  } as { registrationDate: number })
})

export const profileRegistrationQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'registration', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getRegistration(name),
  })
