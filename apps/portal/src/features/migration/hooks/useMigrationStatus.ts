import type { LookupRecord, LookupResult } from '@ens-apps/indexer/bigname'
import {
  type ClassifiedName,
  classifyName,
  needsParentFuses,
  parentNameOf,
  runEligibilityChecks,
  toParentFuses,
  toV1Domain,
} from '@ens-apps/migration'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { useQuery } from '@tanstack/react-query'
import { err, fromPromise, ok, type Result } from 'neverthrow'
import { match } from 'ts-pattern'
import {
  type Address,
  isAddress,
  isAddressEqual,
  type PublicClient,
} from 'viem'
import { useConnection } from 'wagmi'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'
import { safeGetClient } from '@/lib/wagmi/helpers'

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

const NAME_WRAPPER = getChainContractAddress({
  chain: envConfig.chain,
  contract: 'ensNameWrapper',
})

const V1_AUTHORITIES: readonly (string | undefined)[] = ['ens_v1', 'ens_v0']

const isMigratableRecord = (record: LookupRecord): boolean =>
  V1_AUTHORITIES.includes(record.authority) && record.status !== 'released'

// A name bigname has not indexed has no record; any other answer that is not
// `ok` fails the read rather than reading as "cannot migrate".
const recordOf = (
  result: LookupResult | undefined,
): Result<LookupRecord | null, GetMigrationStatusError> =>
  match(result?.status)
    .with('ok', () => ok(result?.record ?? null))
    .with('not_found', undefined, () => ok(null))
    .otherwise((status) =>
      err(new GetMigrationStatusError({ cause: { status, result } })),
    )

/**
 * The name's ENSv1 domain, as the classifier reads it, in one lookup. The
 * parent comes along unless it is `eth`: a wrapped subname needs its fuses.
 */
const getV1Domain = ResultFn(async function* (name: string) {
  const parentName = parentNameOf(name)
  const withParent = parentName !== null && parentName !== 'eth'
  const { data } = yield* bigname
    .lookup({
      namespace: 'ens',
      profile: 'detail',
      inputs: [{ name }, ...(withParent ? [{ name: parentName }] : [])],
    })
    .mapErr((cause) => new GetMigrationStatusError({ cause }))
  const record = yield* recordOf(data[0])
  if (!record || !isMigratableRecord(record)) return ok(null)
  const parent =
    withParent && needsParentFuses(record) ? yield* recordOf(data[1]) : null
  return ok(
    toV1Domain(record, toParentFuses(parent ? [parent] : []), NAME_WRAPPER),
  )
})

const getMigrationStatus = ResultFn(async function* ({
  name,
  address,
}: GetMigrationStatusParameters) {
  const client = yield* safeGetClient()
  const domain = yield* getV1Domain(name)
  if (!domain) return ok<MigrationStatus>({ migratable: false })

  const holderCandidate =
    address ??
    domain.wrappedOwner?.id ??
    domain.registrant?.id ??
    domain.owner?.id
  if (!holderCandidate || !isAddress(holderCandidate))
    return ok<MigrationStatus>({ migratable: false })
  const evaluationAddress = holderCandidate

  const classified = classifyName(domain, evaluationAddress, envConfig.chain.id)
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
 * cannot migrate, so nothing should offer them the action. `isWrapped` marks
 * an unlocked NameWrapper token, which is unwrapped as part of the upgrade.
 *
 * `enabled` exists because the read is not cheap: a bigname lookup plus
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
    isWrapped: data?.migratable === true && data.tokenType === 'unlocked',
  }
}
