import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok } from 'neverthrow'
import { getIndexerDomain } from './getIndexerDomain'

export const getExpiry = ResultFn(async function* (name: string) {
  const domain = yield* getIndexerDomain(name)
  const expiryDate = domain?.expiryDate

  if (!expiryDate) {
    return ok({ expiry: null })
  }

  return ok({ expiry: BigInt(expiryDate) })
})

export const profileExpiryQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'expiry', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getExpiry(name),
  })
