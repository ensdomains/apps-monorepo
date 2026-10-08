import { readNameDetail } from '@ens-apps/indexer/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { bigname } from '@/lib/bigname'

class GetV2RegistrationDataError extends TaggedError(
  'GetV2RegistrationDataError',
)<{
  cause: unknown
}> {}

type GetRegistrationDataParameters = { readonly name: string }

const readDetail = readNameDetail(bigname)

const toSeconds = (date: Date | null | undefined): number | null =>
  date ? Math.floor(date.getTime() / 1000) : null

// An expiry bigname cannot serve as a date, such as a name that never
// expires, comes back as null.
export const getV2RegistrationData = ({
  name,
}: GetRegistrationDataParameters) =>
  readDetail({ name })
    .map((detail) => ({
      createdAt: toSeconds(detail?.createdAt),
      registeredAt: toSeconds(detail?.registeredAt),
      expiry: toSeconds(detail?.expiresAt),
    }))
    .mapErr((cause) => new GetV2RegistrationDataError({ cause }))

const getV2RegistrationDataQueryKey = createQueryKey<
  'get-v2-reg-data',
  GetRegistrationDataParameters
>('get-v2-reg-data')

export const getV2RegistrationDataQueryOptions = (
  params: GetRegistrationDataParameters,
) =>
  resultQueryOptions({
    queryKey: getV2RegistrationDataQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getV2RegistrationData(params),
  })
