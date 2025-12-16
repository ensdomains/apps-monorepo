import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import { graphqlIndexerClient } from '@/lib/indexer'

export class GetV2RegistrationDataError extends TaggedError(
  'GetV2RegistrationDataError',
)<{
  cause: ClientError
}> {}

export type GetRegistrationDataParameters = { name: string }

export const getV2RegistrationData = ResultFn(async function* ({
  name,
}: GetRegistrationDataParameters) {
  const { events, domains } = yield* fromPromise(
    graphqlIndexerClient.request<{
      events: [{ timestamp: number }] | []
      domains: [{ expiryDate: number }] | []
    }>(gql`
      query getRegistrationAndExpiry {
        events(
          first: 1
          where: {domain: "${name}", type: "NameRegistered"}
        ) {
          timestamp
        }
        domains(where: {name: "${name}" }) {
          expiryDate
        }
      }
      `),
    (e) =>
      new GetV2RegistrationDataError({
        cause: e as ClientError,
      }),
  )

  return ok({
    registeredAt: events[0]?.timestamp || null,
    expiry: domains[0]?.expiryDate || null,
  })
})

export const getV2RegistrationDataQueryKey = createQueryKey<
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
