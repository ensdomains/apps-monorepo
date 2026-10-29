import { getSubnameMigrationImpact } from '@ens-apps/migration'
import type { Address, PublicClient } from 'viem'
import { bigname } from '@/lib/bigname'
import type {
  ClassifiedName,
  CopyClassifiedName,
  DirectClassifiedName,
} from './classifyNames'
import { coalesceLatestBlockReads } from './coalesceLatestBlockReads'
import {
  DirectMigrationRouteError,
  resolveDirectMigrationRoutes,
} from './directMigrationRoutes'
import {
  applySubnameRecreation,
  discoverSubnameRecreation,
} from './subnameRecreation'

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
  | 'parent-not-upgraded'
  | 'unsupported-route'

export type BlockedSubnameMigration = {
  readonly name: ClassifiedName
} & (
  | {
      readonly reason: Exclude<
        SubnameMigrationBlockReason,
        'parent-not-upgraded'
      >
    }
  | {
      readonly reason: 'parent-not-upgraded'
      readonly parentName: string
    }
)

/** A read that failed now, rather than a tree the upgrade cannot preserve. */
export const isTransientSubnameBlock = (
  reason: SubnameMigrationBlockReason,
): boolean =>
  reason === 'incomplete-inventory' || reason === 'unverified-source'

// Classify the fixed reason only: the message embeds the name, so a name such
// as label.eth would otherwise match /label/. Anything else is a failed read.
const discoveryFailureReason = (
  error: unknown,
): Exclude<SubnameMigrationBlockReason, 'parent-not-upgraded'> => {
  const message =
    error instanceof Error &&
    '_tag' in error &&
    error._tag === 'SubnameRecreationError' &&
    'detail' in error &&
    typeof error.detail === 'string'
      ? error.detail.toLowerCase()
      : ''
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

type SubnameCandidateResult =
  | {
      readonly status: 'verified'
      readonly subnames: readonly CopyClassifiedName[]
    }
  | { readonly status: 'blocked'; readonly block: BlockedSubnameMigration }

const checkSubnameCandidates = async (params: {
  readonly candidates: readonly ClassifiedName[]
  readonly isSubnameImportEnabled: boolean
  readonly owner: Address
  readonly publicClient: PublicClient
  readonly signal?: AbortSignal
}): Promise<readonly SubnameCandidateResult[]> => {
  const results: SubnameCandidateResult[] = []
  for (
    let offset = 0;
    offset < params.candidates.length;
    offset += DISCOVERY_CONCURRENCY
  ) {
    const batch = await Promise.all(
      params.candidates
        .slice(offset, offset + DISCOVERY_CONCURRENCY)
        .map(async (name): Promise<SubnameCandidateResult> => {
          try {
            const canImport = canImportDirectSubnames(name)
            if (params.isSubnameImportEnabled && canImport) {
              const discovery = await discoverSubnameRecreation({
                domains: [name.domain],
                owner: params.owner,
                publicClient: params.publicClient,
                signal: params.signal,
              })
              const verified = applySubnameRecreation({
                ...discovery,
                classified: [name],
                owner: params.owner,
              })
              return {
                status: 'verified',
                subnames: verified.filter(
                  (item): item is CopyClassifiedName => item.action === 'copy',
                ),
              }
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
                  status: 'blocked',
                  block: {
                    name,
                    reason: canImport
                      ? 'imports-disabled'
                      : 'unsupported-parent',
                  },
                }
              : { status: 'verified', subnames: [] }
          } catch (error) {
            params.signal?.throwIfAborted()
            return {
              status: 'blocked',
              block: { name, reason: discoveryFailureReason(error) },
            }
          }
        }),
    )
    results.push(...batch)
  }
  return results
}

const checkDirectParentRoutes = async (params: {
  readonly names: readonly DirectClassifiedName[]
  readonly publicClient: PublicClient
  readonly signal?: AbortSignal
}): Promise<readonly BlockedSubnameMigration[]> => {
  const byName = new Map(params.names.map((name) => [name.domain.name, name]))
  const children = params.names.filter(
    (name) =>
      name.tokenType === 'locked-child' || name.tokenType === 'detached-child',
  )
  const blocked: BlockedSubnameMigration[] = []
  for (
    let offset = 0;
    offset < children.length;
    offset += DISCOVERY_CONCURRENCY
  ) {
    params.signal?.throwIfAborted()
    const batch = await Promise.all(
      children
        .slice(offset, offset + DISCOVERY_CONCURRENCY)
        .map(async (name) => {
          const ancestors = new Map([[name.domain.name, name]])
          let parent = byName.get(name.parentName ?? '')
          while (parent && !ancestors.has(parent.domain.name)) {
            ancestors.set(parent.domain.name, parent)
            parent = byName.get(parent.parentName ?? '')
          }
          try {
            await resolveDirectMigrationRoutes({
              publicClient: params.publicClient,
              classified: [...ancestors.values()],
            })
            params.signal?.throwIfAborted()
            return []
          } catch (error) {
            params.signal?.throwIfAborted()
            if (
              error instanceof DirectMigrationRouteError &&
              error.reason === 'missing-wrapper'
            ) {
              return [
                {
                  name,
                  reason: 'parent-not-upgraded',
                  parentName: error.ensName,
                } satisfies BlockedSubnameMigration,
              ]
            }
            if (error instanceof DirectMigrationRouteError) {
              return [
                {
                  name,
                  reason: 'unsupported-route',
                } satisfies BlockedSubnameMigration,
              ]
            }
            return [
              {
                name,
                reason: 'unverified-source',
              } satisfies BlockedSubnameMigration,
            ]
          }
        }),
    )
    blocked.push(...batch.flat())
  }
  const childrenByParent = new Map<string, DirectClassifiedName[]>()
  for (const child of children) {
    if (!child.parentName) continue
    const siblings = childrenByParent.get(child.parentName) ?? []
    siblings.push(child)
    childrenByParent.set(child.parentName, siblings)
  }
  const blockedNames = new Set(blocked.map(({ name }) => name.domain.name))
  // A descendant cannot use a same-plan ancestor that another check removed.
  for (let index = 0; index < blocked.length; index += 1) {
    const parentBlock = blocked[index]
    if (!parentBlock) continue
    for (const child of childrenByParent.get(parentBlock.name.domain.name) ??
      []) {
      if (blockedNames.has(child.domain.name)) continue
      blockedNames.add(child.domain.name)
      blocked.push({ ...parentBlock, name: child })
    }
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
  readonly verifiedSubnames: readonly CopyClassifiedName[]
}> => {
  const direct = params.eligible.filter(
    (name): name is DirectClassifiedName => name.action === 'migrate',
  )
  // Include children controlled by other wallets: the owner's name list
  // alone cannot establish that the complete tree can be preserved.
  const checked = await checkSubnameCandidates({
    candidates: direct,
    isSubnameImportEnabled: params.isSubnameImportEnabled,
    owner: params.owner,
    publicClient: coalesceLatestBlockReads(params.publicClient),
    signal: params.signal,
  })
  const blocked = checked.flatMap((result) =>
    result.status === 'blocked' ? [result.block] : [],
  )
  const blockedCandidateIds = new Set(blocked.map(({ name }) => name.domain.id))
  blocked.push(
    ...(await checkDirectParentRoutes({
      names: direct.filter(({ domain }) => !blockedCandidateIds.has(domain.id)),
      publicClient: params.publicClient,
      signal: params.signal,
    })),
  )
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
    // Direct children are shown under their parent, never selected as
    // standalone copy actions. Plan preparation revalidates this inventory.
    eligible: direct.filter(({ domain }) => !blockedIds.has(domain.id)),
    blockedSubnames: blocked,
    verifiedSubnames: checked.flatMap((result) =>
      result.status === 'verified' ? result.subnames : [],
    ),
  }
}
