import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getAddressRecord } from '@ensdomains/ensjs/public'
import { useQuery } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'

class EnsAddressError extends TaggedError('EnsAddressError')<{
  cause: unknown
}> {}

/** Forward-resolves a name to its ETH (coin 60) address record. */
export const getEnsAddress = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()

  const record = yield* await fromPromise(
    getAddressRecord(client, { name }),
    (e) => new EnsAddressError({ cause: e }),
  )
  return ok((record?.value as Address | undefined) ?? null)
})

const ensAddressQueryKey = createQueryKey<'ens-address', { name: string }>(
  'ens-address',
)

export const getEnsAddressQueryOptions = (name: string) =>
  resultQueryOptions({
    queryKey: ensAddressQueryKey({ name }),
    queryFn: ({ queryKey: [, { name }] }) => getEnsAddress(name),
  })

export const useEnsAddress = (name: string) => {
  return useQuery(getEnsAddressQueryOptions(name))
}
