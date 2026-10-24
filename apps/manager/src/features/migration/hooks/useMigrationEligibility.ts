import { getSubnameMigrationImpact } from '@ens-apps/migration'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useFeatureFlagEnabled } from '@posthog/react'
import { useQuery } from '@tanstack/react-query'
import type { Address, PublicClient } from 'viem'
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
