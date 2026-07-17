import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getAddressRecord } from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { normalize } from 'viem/ens'
import { safeGetClient } from '@/lib/wagmi/helpers'

class EnsAddressError extends TaggedError('EnsAddressError')<{
  cause: unknown
}> {}

/** Forward-resolves a name to its ETH (coin 60) address record. */
export const getEnsAddress = ResultFn(async function* (name: string) {
  // Names must be ENSIP-15 normalized before resolution; a name that can't
  // be normalized can't resolve, so report it as having no address.
  let normalized: string
  try {
    normalized = normalize(name)
  } catch {
    return ok(null)
  }

  const client = yield* safeGetClient()

  const record = yield* fromPromise(
    getAddressRecord(client, { name: normalized }),
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
