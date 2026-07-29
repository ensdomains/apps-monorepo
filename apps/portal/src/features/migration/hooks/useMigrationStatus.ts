import {
  classifyName,
  runEligibilityChecks,
  type V1Domain,
} from '@ens-apps/migration'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { createSubgraphClient } from '@ensdomains/ensjs/subgraph'
import { gql } from 'graphql-request'
import { err, fromPromise, ok } from 'neverthrow'
import type { Address, PublicClient } from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'

/**
 * Migration status for a name, scoped to the connected wallet: whether it can
 * migrate and, if so, which address holds the v1 token.
 */
export type MigrationStatus =
  | { readonly migratable: true; readonly tokenHolder: Address }
  | { readonly migratable: false }

type V1DomainResponse = { domains: V1Domain[] }

class GetMigrationStatusError extends TaggedError('GetMigrationStatusError')<{
  cause: unknown
}> {}

type GetMigrationStatusParameters = {
  name: string
  /** The wallet to evaluate migratability for; the verdict is owner-scoped. */
  address: Address | undefined
}

const fetchV1Domain = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()
  const subgraphClient = createSubgraphClient(client)

  const { domains } = yield* fromPromise(
    subgraphClient.request<V1DomainResponse, { name: string }>(
      gql`
        query getV1DomainForMigration($name: String!) {
          domains(where: { name: $name }) {
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
      `,
      { name },
    ),
    (e) => new GetMigrationStatusError({ cause: e }),
  )

  return ok({ client, domain: domains[0] ?? null })
})

/** Classify + on-chain preflight for one (domain, acting address) pair. */
const evaluateMigration = ResultFn(async function* (
  client: unknown,
  domain: V1Domain,
  address: Address,
) {
  const classified = classifyName(domain, address)
  if (classified?.type !== 'classified')
    return ok<MigrationStatus>({ migratable: false })

  const { eligible, failed } = yield* fromPromise(
    runEligibilityChecks(
      client as unknown as PublicClient,
      [classified.name],
      address,
    ),
    (e) => new GetMigrationStatusError({ cause: e }),
  )

  if (failed.length > 0)
    return err(
      new GetMigrationStatusError({
        cause: new Error('preflight could not read on-chain ownership'),
      }),
    )

  return ok<MigrationStatus>(
    eligible.length > 0
      ? { migratable: true, tokenHolder: classified.name.tokenHolder }
      : { migratable: false },
  )
})

const getMigrationStatus = ResultFn(async function* ({
  name,
  address,
}: GetMigrationStatusParameters) {
  if (!address) return ok<MigrationStatus>({ migratable: false })

  const { client, domain } = yield* fetchV1Domain(name)
  if (!domain) return ok<MigrationStatus>({ migratable: false })

  return ok(yield* evaluateMigration(client, domain, address))
})

/**
 * Name-scoped migration verdict: evaluated against the name's own V1 token
 * holder — wrappedOwner for wrapped names, registrant for unwrapped ones
 * (the registry `owner` is the controller and may be a different address, so
 * it is only a last-resort fallback). Use this for surfaces shown to any
 * visitor (e.g. the registry page's migrate prompt), where "can THIS name
 * migrate" matters rather than "can the connected wallet migrate it".
 */
const getNameMigrationStatus = ResultFn(async function* ({
  name,
}: {
  name: string
}) {
  const { client, domain } = yield* fetchV1Domain(name)
  if (!domain) return ok<MigrationStatus>({ migratable: false })

  const holder = (domain.wrappedOwner?.id ??
    domain.registrant?.id ??
    domain.owner?.id) as Address | undefined
  if (!holder) return ok<MigrationStatus>({ migratable: false })

  return ok(yield* evaluateMigration(client, domain, holder))
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
    retry: 2,
  })

const getNameMigrationStatusQueryKey = createQueryKey<
  'get-name-migration-status',
  { name: string }
>('get-name-migration-status')

export const getNameMigrationStatusQueryOptions = (params: { name: string }) =>
  resultQueryOptions({
    queryKey: getNameMigrationStatusQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameMigrationStatus(params),
    enabled: !!params.name,
    retry: 2,
  })
