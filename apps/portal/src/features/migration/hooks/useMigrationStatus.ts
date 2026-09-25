import {
  type ClassifiedName,
  classifyName,
  runEligibilityChecks,
  type V1Domain,
} from '@ens-apps/migration'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { createSubgraphClient } from '@ensdomains/ensjs/subgraph'
import { useQuery } from '@tanstack/react-query'
import { err, fromPromise, ok } from 'neverthrow'
import {
  type Address,
  isAddress,
  isAddressEqual,
  type PublicClient,
} from 'viem'
import { useConnection } from 'wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { gql } from '@/utils/subgraph/gql'

/**
 * Migration status for a name, scoped to the connected wallet: whether it can
 * migrate and, if so, which address holds the v1 token and which kind of token
 * it is (`unlocked` is a wrapped .eth name that is unwrapped on the way to v2).
 */
export type MigrationStatus =
  | {
      readonly migratable: true
      readonly tokenHolder: Address
      readonly tokenType: ClassifiedName['tokenType']
    }
  | { readonly migratable: false }

type V1DomainResponse = { domains: V1Domain[] }

class GetMigrationStatusError extends TaggedError('GetMigrationStatusError')<{
  cause: unknown
}> {}

type GetMigrationStatusParameters = {
  name: string
  /**
   * The wallet to evaluate migratability for. Omit for a name-scoped verdict:
   * migratability is then evaluated against the name's own V1 token holder —
   * wrappedOwner while the wrap is live, otherwise the Base Registrar
   * registrant (the registry `owner` is the controller, which may be a
   * different address, so it is only a last-resort fallback). Use the
   * name-scoped form for surfaces shown to any visitor (e.g. the registry
   * page's migrate prompt).
   */
  address?: Address
}

const getMigrationStatus = ResultFn(async function* ({
  name,
  address,
}: GetMigrationStatusParameters) {
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

  const domain = domains[0] ?? null
  if (!domain) return ok<MigrationStatus>({ migratable: false })

  const holderCandidate =
    address ??
    domain.wrappedOwner?.id ??
    domain.registrant?.id ??
    domain.owner?.id
  if (!holderCandidate || !isAddress(holderCandidate))
    return ok<MigrationStatus>({ migratable: false })
  const evaluationAddress = holderCandidate

  const classified = classifyName(domain, evaluationAddress)
  if (classified?.type !== 'classified')
    return ok<MigrationStatus>({ migratable: false })

  const { eligible, failed } = yield* fromPromise(
    runEligibilityChecks(
      client as unknown as PublicClient,
      [classified.name],
      evaluationAddress,
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
      ? {
          migratable: true,
          tokenHolder: classified.name.tokenHolder,
          tokenType: classified.name.tokenType,
        }
      : { migratable: false },
  )
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
    enabled: !!params.name,
    retry: 2,
  })

/**
 * Migration status for the connected wallet.
 *
 * `isMigratableByConnectedOwner` is the answer every migration prompt wants:
 * the name is migratable *and* this wallet holds the v1 token. A non-owner
 * cannot migrate, so nothing should offer them the action.
 *
 * `enabled` exists because the read is not cheap: a subgraph request plus
 * on-chain eligibility checks. Callers pass false for anything that is not a
 * v1 name.
 */
export const useMigrationStatus = (
  name: string,
  { enabled = true }: { enabled?: boolean } = {},
) => {
  const { address } = useConnection()

  const { data, isLoading, error } = useQuery({
    ...getMigrationStatusQueryOptions({ name, address }),
    enabled: enabled && !!address,
  })

  return {
    data,
    error,
    isLoading,
    isMigratableByConnectedOwner:
      data?.migratable === true &&
      !!address &&
      isAddressEqual(address, data.tokenHolder),
  }
}
