import {
  isNameProfile,
  type LookupDetailRecord,
  type LookupProfileRecord,
  type LookupResult,
} from '@ens-apps/bigname'
import {
  type ClassifiedName,
  classifyName,
  runEligibilityChecks,
  v1DomainFromBigname,
  v1ParentName,
} from '@ens-apps/migration'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { err, fromPromise, ok } from 'neverthrow'
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

const isMigratableV1 = (
  record: LookupDetailRecord | undefined,
): record is LookupProfileRecord =>
  !!record &&
  isNameProfile(record) &&
  (record.authority === 'ens_v1' || record.authority === 'ens_v0') &&
  record.registration_status !== 'released'

const getLookupRecord = (result: LookupResult | undefined) => {
  if (
    result?.kind !== 'name' ||
    result.status === 'failed' ||
    result.status === 'stale' ||
    (result.status === 'ok' && !result.record)
  )
    return err(
      new GetMigrationStatusError({
        cause: new Error('BigName could not read migration details'),
      }),
    )
  return ok(result.status === 'ok' ? result.record : undefined)
}

const getMigrationStatus = ResultFn(async function* ({
  name,
  address,
}: GetMigrationStatusParameters) {
  const client = yield* safeGetClient()

  // Include a possible wrapped subname's parent up front so its fuse read
  // shares one request with the child. Unwrapped names may return an unused
  // parent record; .eth 2LDs never need an eth read.
  const parentName = v1ParentName(name)
  const includeParent = parentName && parentName.toLowerCase() !== 'eth'
  const response = yield* fromPromise(
    bigname.lookup({
      profile: 'detail',
      inputs: [
        { id: 'name', name },
        ...(includeParent ? [{ id: 'parent', name: parentName }] : []),
      ],
    }),
    (e) => new GetMigrationStatusError({ cause: e }),
  )
  const record = yield* getLookupRecord(
    response.data.find((result) => result.input.id === 'name'),
  )
  // Only a live ENSv1 name can migrate. `ens_v0` (still read from the 2017
  // registry) is ENSv1 too. An `ens_v2` name has migrated, or is held by a
  // released ENSv2 registration that owns the name even while an old ENSv1
  // lease is live; a released ENSv1 lease has no holder left to migrate it.
  if (!isMigratableV1(record)) return ok<MigrationStatus>({ migratable: false })

  // A speculative parent failure must not hide an unwrapped name's verdict.
  const needsParent =
    record.ens_v1?.wrapper_expires_at !== undefined && includeParent
  const parent = needsParent
    ? yield* getLookupRecord(
        response.data.find((result) => result.input.id === 'parent'),
      )
    : undefined
  const domain = yield* fromPromise(
    Promise.resolve().then(() =>
      v1DomainFromBigname(
        record,
        parent && isNameProfile(parent) ? parent : null,
      ),
    ),
    (e) => new GetMigrationStatusError({ cause: e }),
  )

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
 * `enabled` exists because the read is not cheap: one BigName lookup plus
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
