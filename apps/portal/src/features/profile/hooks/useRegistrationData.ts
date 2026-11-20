import {
  type IndexerReadError,
  type NameDetail,
  retryStaleRead,
} from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { Hash } from 'viem'
import { requireIndexed } from '@/features/history/requireIndexed'
import { indexer } from '@/lib/indexer'
import { normalizeOrLower } from '@/utils/ens/normalizeOrLower'
import { getNameDetailQueryOptions } from './useNameDetail'

type GetRegistrationDataParameters = { readonly name: string }

const toSeconds = (date: Date | null | undefined): number | null =>
  date ? Math.floor(date.getTime() / 1000) : null

// An expiry the indexer cannot serve as a date, such as a name that never
// expires, comes back as null.
const toRegistrationData = (detail: NameDetail | null) => ({
  createdAt: toSeconds(detail?.createdAt),
  registeredAt: toSeconds(detail?.registeredAt),
  expiry: toSeconds(detail?.expiresAt),
  graceEnd: toSeconds(detail?.graceEndsAt),
})

/** A name's expiry and registration dates, in either era, from its detail. */
export const getRegistrationDataQueryOptions = (
  params: GetRegistrationDataParameters,
) => ({
  ...getNameDetailQueryOptions(params),
  select: toRegistrationData,
})

class GetRegistrationTxError extends TaggedError('GetRegistrationTxError')<{
  cause: IndexerReadError
}> {}

type GetRegistrationTxParameters = {
  readonly name: string
  readonly registeredAt: number
}

const getRegistrationTxQueryKey = createQueryKey<
  'get-registration-tx',
  GetRegistrationTxParameters
>('get-registration-tx')

const readRegistrationTx = (
  { name, registeredAt }: GetRegistrationTxParameters,
  signal: AbortSignal,
) =>
  retryStaleRead(
    (requestSignal) =>
      indexer
        .getNameHistory(
          {
            name: normalizeOrLower(name),
            types: ['registration'],
            order: 'asc',
            from: new Date(registeredAt * 1000),
            pageSize: 1,
          },
          { signal: requestSignal },
        )
        .andThen(requireIndexed(name)),
    { signal },
  )
    .map(({ items }): Hash | null => items[0]?.transactionHash ?? null)
    .mapErr((cause) => new GetRegistrationTxError({ cause }))

/**
 * The transaction `registered_at` dates: the name's first `registration` row
 * from then on. Anchored on the name, not `registration_id`, which for a
 * migrated name is the migration grant.
 */
export const getRegistrationTxQueryOptions = (
  params: GetRegistrationTxParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistrationTxQueryKey(params),
    queryFn: ({ signal }) => readRegistrationTx(params, signal),
  })
