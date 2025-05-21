import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { getAvailable } from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class NameAvailabilityError extends TaggedError(
  'NameAvailabilityError',
)<{
  cause: unknown
}> { }

export const checkNameAvailability = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()

  const nameWithEth = name.endsWith('.eth') ? name : `${name}.eth`
  const availability = yield* await fromPromise(
    getAvailable(client, { name: nameWithEth }),
    (e) => new NameAvailabilityError({ cause: e }),
  )

  return ok({
    isAvailable: availability,
    name: nameWithEth,
  })
})

