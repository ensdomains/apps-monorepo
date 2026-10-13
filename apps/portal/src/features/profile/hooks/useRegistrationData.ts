import {
  type BignameError,
  isStale,
  retryStale,
} from '@ens-apps/indexer/bigname'
import type { NameDetail } from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import type { Hash } from 'viem'
import { bigname } from '@/lib/bigname'
import { getNameDetailQueryOptions } from './useNameDetail'

type GetRegistrationDataParameters = { readonly name: string }

const toSeconds = (date: Date | null | undefined): number | null =>
  date ? Math.floor(date.getTime() / 1000) : null

// An expiry bigname cannot serve as a date, such as a name that never
// expires, comes back as null.
const toRegistrationData = (detail: NameDetail | null) => ({
  createdAt: toSeconds(detail?.createdAt),
  registeredAt: toSeconds(detail?.registeredAt),
  registrationId: detail?.registrationId ?? null,
  expiry: toSeconds(detail?.expiresAt),
})

/** A name's expiry and registration dates, in either era, from its detail. */
export const getRegistrationDataQueryOptions = (
  params: GetRegistrationDataParameters,
) => ({
  ...getNameDetailQueryOptions(params),
  select: toRegistrationData,
})

class GetRegistrationTxError extends TaggedError('GetRegistrationTxError')<{
  cause: BignameError
}> {}

type GetRegistrationTxParameters = { readonly registrationId: string | null }

const getRegistrationTxQueryKey = createQueryKey<
  'get-registration-tx',
  GetRegistrationTxParameters
>('get-registration-tx')

const readRegistrationTx = (registrationId: string, signal: AbortSignal) =>
  retryStale(
    (requestSignal) =>
      bigname.events(
        {
          registration_id: registrationId,
          type: ['registration'],
          order: 'asc',
          page_size: 1,
        },
        { signal: requestSignal },
      ),
    isStale,
    { signal },
  )
    .map(({ data }): Hash | null => data[0]?.transaction_hash ?? null)
    .mapErr((cause) => new GetRegistrationTxError({ cause }))

/**
 * The transaction that started the current registration: its oldest
 * `registration` row. Anchored on the registration, so a name released and
 * registered again links its new registration, as `registered_at` dates it.
 */
export const getRegistrationTxQueryOptions = ({
  registrationId,
}: GetRegistrationTxParameters) =>
  resultQueryOptions({
    queryKey: getRegistrationTxQueryKey({ registrationId }),
    queryFn: registrationId
      ? ({ signal }) => readRegistrationTx(registrationId, signal)
      : skipToken,
  })
