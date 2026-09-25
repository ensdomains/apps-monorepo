import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getRecords } from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import { DEBUG_PROFILE } from '@/features/profile/MOCK'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { isDebugProfileName } from '@/utils/debug-features'

const ADDRESS_HEADER_TEXT_KEYS = [
  'theme',
  'header',
  'description',
  'url',
] as const

class GetAddressHeaderRecordsError extends TaggedError(
  'GetAddressHeaderRecordsError',
)<{
  cause: unknown
}> {}

export const getAddressHeaderRecords = ResultFn(async function* (name: string) {
  if (isDebugProfileName(name)) {
    return ok({
      texts: DEBUG_PROFILE.texts.filter(({ key }) =>
        ADDRESS_HEADER_TEXT_KEYS.some((textKey) => textKey === key),
      ),
      coins: [],
    })
  }

  const client = yield* safeGetClient()
  const records = yield* fromPromise(
    getRecords(client, { name, texts: ADDRESS_HEADER_TEXT_KEYS }),
    (cause) => new GetAddressHeaderRecordsError({ cause }),
  )

  return ok({ texts: records.texts, coins: [] })
})

export const profileAddressHeaderRecordsQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'get_records', {
      name,
      selection: 'address-header',
    }),
    queryFn: ({ queryKey: [{ name }] }) => getAddressHeaderRecords(name),
    staleTime: 60_000,
  })
