import {
  BASE_REGISTRAR_ABI,
  getSubnameMigrationImpact,
} from '@ens-apps/migration'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { baseRegistrarNameExpiresSnippet } from '@ensdomains/ensjs-abi/v1/baseRegistrar'
import { nameWrapperGetDataSnippet } from '@ensdomains/ensjs-abi/v1/nameWrapper'
import { useFeatureFlagEnabled } from '@posthog/react'
import { useQuery } from '@tanstack/react-query'
import { type Address, isAddressEqual, type PublicClient } from 'viem'
import { V1_CONTRACTS } from '@/features/migration/contracts/addresses'
import type { ClassifiedName } from '@/features/migration/service/classifyNames'
import { runEligibilityChecks } from '@/features/migration/service/preflightChecks'
import { discoverSubnameRecreation } from '@/features/migration/service/subnameRecreation'
import { bigname } from '@/lib/bigname'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { publicClient } from '@/lib/wagmi'

const ELIGIBILITY_STALE_MS = 60_000
const DISCOVERY_CONCURRENCY = 4

export type SubnameMigrationBlockReason =
  | 'imports-disabled'
  | 'unsupported-parent'
  | 'deeper-subnames'
  | 'wrapped-protections'
  | 'too-large'
  | 'unknown-label'
  | 'incomplete-inventory'
  | 'unverified-source'
  | 'requires-parent'
  | 'wrapper-needs-sync'

export type BlockedSubnameMigration = {
  readonly name: ClassifiedName
  readonly reason: SubnameMigrationBlockReason
}

const discoveryFailureReason = (
  error: unknown,
): SubnameMigrationBlockReason => {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (/fourth-level|deeper/.test(message)) return 'deeper-subnames'
  if (/too large|too many/.test(message)) return 'too-large'
  if (/label/.test(message)) return 'unknown-label'
  if (/wrapped|permissions|protections|fuses/.test(message))
    return 'wrapped-protections'
  if (/inventory|index|checkpoint|missing|duplicated/.test(message))
    return 'incomplete-inventory'
  return 'unverified-source'
}

const canImportDirectSubnames = (name: ClassifiedName): boolean =>
  name.parentName === 'eth' &&
  (name.tokenType === 'unwrapped' || name.tokenType === 'unlocked')

const findUnsyncedWrappers = async (
  client: PublicClient,
  names: readonly ClassifiedName[],
): Promise<readonly BlockedSubnameMigration[]> => {
  const candidates = names.filter(
    (name) => name.tokenType === 'unlocked' || name.tokenType === 'locked-2ld',
  )
  if (candidates.length === 0) return []
  const block = await client.getBlock()
  const results = await Promise.all(
    candidates.map(async (name): Promise<BlockedSubnameMigration | null> => {
      const [registrant, registrationExpiry, [, , wrapperExpiry]] =
        await Promise.all([
          client.readContract({
            address: V1_CONTRACTS.BaseRegistrar,
            abi: BASE_REGISTRAR_ABI,
            functionName: 'ownerOf',
            args: [BigInt(name.domain.labelhash)],
            blockNumber: block.number,
          }),
          client.readContract({
            address: V1_CONTRACTS.BaseRegistrar,
            abi: baseRegistrarNameExpiresSnippet,
            functionName: 'nameExpires',
            args: [BigInt(name.domain.labelhash)],
            blockNumber: block.number,
          }),
          client.readContract({
            address: V1_CONTRACTS.NameWrapper,
            abi: nameWrapperGetDataSnippet,
            functionName: 'getData',
            args: [BigInt(name.domain.id)],
            blockNumber: block.number,
          }),
        ])
      return isAddressEqual(registrant, V1_CONTRACTS.NameWrapper) &&
        registrationExpiry > block.timestamp &&
        wrapperExpiry < registrationExpiry + 90n * 24n * 60n * 60n
        ? { name, reason: 'wrapper-needs-sync' }
        : null
    }),
  )
  return results.filter(
    (result): result is BlockedSubnameMigration => result !== null,
  )
}

const checkSubnameCandidates = async (params: {
  readonly candidates: readonly ClassifiedName[]
  readonly importsEnabled: boolean
  readonly owner: Address
  readonly publicClient: PublicClient
  readonly signal: AbortSignal
}): Promise<readonly BlockedSubnameMigration[]> => {
  const blocked: BlockedSubnameMigration[] = []
  for (
    let offset = 0;
    offset < params.candidates.length;
    offset += DISCOVERY_CONCURRENCY
  ) {
    const failures = await Promise.all(
      params.candidates
        .slice(offset, offset + DISCOVERY_CONCURRENCY)
        .map(async (name): Promise<BlockedSubnameMigration | null> => {
          try {
            const canImport = canImportDirectSubnames(name)
            if (params.importsEnabled && canImport) {
              await discoverSubnameRecreation({
                domains: [name.domain],
                owner: params.owner,
                publicClient: params.publicClient,
                signal: params.signal,
              })
              return null
            }
            const impact = await getSubnameMigrationImpact({
              indexer: bigname,
              publicClient: params.publicClient,
              migratingNames: [name.domain.name],
              signal: params.signal,
            })
            if (impact.isErr()) throw impact.error
            return impact.value.affectedCount > 0
              ? {
                  name,
                  reason: canImport ? 'imports-disabled' : 'unsupported-parent',
                }
              : null
          } catch (error) {
            params.signal.throwIfAborted()
            return { name, reason: discoveryFailureReason(error) }
          }
        }),
    )
    blocked.push(
      ...failures.filter(
        (failure): failure is BlockedSubnameMigration => failure !== null,
      ),
    )
  }
  return blocked
}

export const useMigrationEligibility = (
  names: readonly ClassifiedName[],
  ownerAddress?: string | null,
) => {
  const importsEnabled =
    useFeatureFlagEnabled(
      POSTHOG_FEATURE_FLAGS.MIGRATION_SUBNAME_RECREATION,
      false,
    ) === true
  return useQuery({
    queryKey: qk('migration', 'eligibility', {
      owner: ownerAddress?.toLowerCase(),
      importsEnabled,
      names: names.map((name) => ({
        id: name.domain.id,
        action: name.action,
        tokenType: name.tokenType,
        owner: name.tokenHolder,
        fuses: name.fuses.toString(),
        resolver: name.v1ResolverAddress,
        registrationExpiry: name.domain.registration?.expiryDate,
        wrappedExpiry: name.domain.wrappedDomain?.expiryDate,
      })),
    }),
    queryFn: async ({ signal }) => {
      const client = publicClient as PublicClient
      const owner = ownerAddress as Address
      const result = await runEligibilityChecks(client, [...names], owner)
      signal.throwIfAborted()
      const direct = result.eligible.filter((name) => name.action === 'migrate')
      // Include children controlled by other wallets: the owner's name list
      // alone cannot establish that the complete tree can be preserved.
      const blocked = [
        ...(await findUnsyncedWrappers(client, result.alreadyMigrated)),
        ...(await checkSubnameCandidates({
          candidates: direct,
          importsEnabled,
          owner,
          publicClient: client,
          signal,
        })),
      ]
      const directNames = new Set(
        direct.map(({ domain }) => domain.name.toLowerCase()),
      )
      blocked.push(
        ...result.eligible
          .filter(
            (name) =>
              name.action === 'copy' &&
              !directNames.has(name.parentName?.toLowerCase() ?? ''),
          )
          .map((name) => ({ name, reason: 'requires-parent' as const })),
      )
      const blockedIds = new Set(blocked.map(({ name }) => name.domain.id))
      return {
        ...result,
        // Direct children are discovered from their parent and reviewed in the
        // prepared plan; they are never selected as standalone copy actions.
        eligible: direct.filter(({ domain }) => !blockedIds.has(domain.id)),
        blockedSubnames: blocked,
      }
    },
    enabled: !!ownerAddress && names.length > 0,
    staleTime: ELIGIBILITY_STALE_MS,
    retry: false,
  })
}
