import { getSubnameMigrationImpact } from '@ens-apps/migration'
import type { Address, PublicClient } from 'viem'
import { bigname } from '@/lib/bigname'
import type { ClassifiedName } from './classifyNames'
import { discoverSubnameRecreation } from './subnameRecreation'

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

/** A read that failed now, rather than a tree the upgrade cannot preserve. */
export const isTransientSubnameBlock = (
  reason: SubnameMigrationBlockReason,
): boolean =>
  reason === 'incomplete-inventory' || reason === 'unverified-source'

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
  readonly isSubnameImportEnabled: boolean
  readonly owner: Address
  readonly publicClient: PublicClient
  readonly signal?: AbortSignal
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
            if (params.isSubnameImportEnabled && canImport) {
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
            params.signal?.throwIfAborted()
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

/**
 * The names the upgrade screen offers, and why the rest must stay on ENSv1.
 * The NFT completion check shares this so it never waits on a name the user
 * cannot select.
 */
export const resolveMigratableNames = async (params: {
  readonly eligible: readonly ClassifiedName[]
  readonly isSubnameImportEnabled: boolean
  readonly owner: Address
  readonly publicClient: PublicClient
  readonly signal?: AbortSignal
}): Promise<{
  readonly eligible: readonly ClassifiedName[]
  readonly blockedSubnames: readonly BlockedSubnameMigration[]
}> => {
  const direct = params.eligible.filter((name) => name.action === 'migrate')
  // Include children controlled by other wallets: the owner's name list
  // alone cannot establish that the complete tree can be preserved.
  const blocked = [
    ...(await checkSubnameCandidates({
      candidates: direct,
      isSubnameImportEnabled: params.isSubnameImportEnabled,
      owner: params.owner,
      publicClient: params.publicClient,
      signal: params.signal,
    })),
  ]
  const directNames = new Set(
    direct.map(({ domain }) => domain.name.toLowerCase()),
  )
  blocked.push(
    ...params.eligible
      .filter(
        (name) =>
          name.action === 'copy' &&
          !directNames.has(name.parentName?.toLowerCase() ?? ''),
      )
      .map((name) => ({ name, reason: 'requires-parent' as const })),
  )
  const blockedIds = new Set(blocked.map(({ name }) => name.domain.id))
  return {
    // Direct children are discovered from their parent and reviewed in the
    // prepared plan; they are never selected as standalone copy actions.
    eligible: direct.filter(({ domain }) => !blockedIds.has(domain.id)),
    blockedSubnames: blocked,
  }
}
