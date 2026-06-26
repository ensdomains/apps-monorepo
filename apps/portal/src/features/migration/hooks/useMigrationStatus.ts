import {
  evaluateMigration,
  type MigrationVerdict,
  type V1Domain,
} from '@ens-apps/migration'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { createSubgraphClient } from '@ensdomains/ensjs/subgraph'
import { gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import type { Address, PublicClient } from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'

/** The migration verdict for a name, as computed by `@ens-apps/migration`. */
export type MigrationStatus = MigrationVerdict

const V1_DOMAIN_QUERY = gql`
  query getV1DomainForMigration($name: String!) {
    domains(where: { name: $name }, first: 1) {
      id
      labelName
      labelhash
      name
      resolver { address }
      owner { id }
      registrant { id }
      wrappedOwner { id }
      parent { name wrappedDomain { fuses } }
      registration { expiryDate }
      wrappedDomain { expiryDate fuses }
    }
  }
`

type V1DomainResponse = { domains: V1Domain[] }

class GetMigrationStatusError extends TaggedError('GetMigrationStatusError')<{
  cause: unknown
}> {}

type GetMigrationStatusParameters = {
  name: string
  /** The wallet to evaluate migratability for; the verdict is owner-scoped. */
  address: Address | undefined
}

const getMigrationStatus = ResultFn(async function* ({
  name,
  address,
}: GetMigrationStatusParameters) {
  if (!address)
    return ok<MigrationVerdict>({ migratable: false, reason: 'not-found' })

  const client = yield* safeGetClient()
  const subgraphClient = createSubgraphClient(client)

  const { domains } = yield* fromPromise(
    subgraphClient.request<V1DomainResponse, { name: string }>(
      V1_DOMAIN_QUERY,
      { name },
    ),
    (e) => new GetMigrationStatusError({ cause: e }),
  )

  const verdict = yield* fromPromise(
    evaluateMigration(
      client as unknown as PublicClient,
      domains[0] ?? null,
      address,
    ),
    (e) => new GetMigrationStatusError({ cause: e }),
  )

  return ok(verdict)
})

const getMigrationStatusQueryKey = createQueryKey<
  'get-migration-status',
  GetMigrationStatusParameters
>('get-migration-status')

export const getMigrationStatusQueryOptions = (
  params: GetMigrationStatusParameters,
) =>
  resultQueryOptions({
    queryKey: getMigrationStatusQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getMigrationStatus(params),
    enabled: !!params.name && !!params.address,
  })
