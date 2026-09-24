import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getRecords } from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import { DEBUG_PROFILE } from '@/features/profile/MOCK'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { isDebugProfileName } from '@/utils/debug-features'

const NAME_ROW_TEXT_KEYS = ['avatar', 'theme'] as const

class GetNameRowRecordsError extends TaggedError('GetNameRowRecordsError')<{
  cause: unknown
}> {}

export const getNameRowRecords = ResultFn(async function* (name: string) {
  if (isDebugProfileName(name)) {
    return ok({
      texts: DEBUG_PROFILE.texts.filter(({ key }) =>
        NAME_ROW_TEXT_KEYS.some((textKey) => textKey === key),
      ),
    })
  }

  const client = yield* safeGetClient()
  const records = yield* fromPromise(
    getRecords(client, { name, texts: NAME_ROW_TEXT_KEYS }),
    (cause) => new GetNameRowRecordsError({ cause }),
  )

  return ok({ texts: records.texts })
})

export const nameRowRecordsQuery = (name: string) =>
  resultQueryOptions({
    // Keep profile edit invalidation, but never share partial data with a profile.
    queryKey: qk('profile', 'get_records', { name, selection: 'name-row' }),
    queryFn: ({ queryKey: [{ name }] }) => getNameRowRecords(name),
  })
