import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import { namechainEthRegistryAddress } from '@/lib/constants/registry'
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
  const data = yield* fromPromise(
    graphqlIndexerClient.request<{
      events: [{ timestamp: number }]
      domains: [{ expiryDate: number }]
    }>(gql`
      query getRegistrationAndExpiry {
        events(
          first: 1
          where: {domain: "${name}", type: "NameRegistered", contractAddress: "${namechainEthRegistryAddress.toLowerCase()}"}
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

  const { timestamp: registeredAt } = data.events[0]
  const { expiryDate: expiry } = data.domains[0]

  return ok({ registeredAt, expiry })
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
