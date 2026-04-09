import { TaggedError } from '@ens-apps/utils/neverthrow'
import {
  type Config as WagmiConfig,
  waitForTransactionReceipt,
  writeContract,
} from '@wagmi/core'
import type { Address, Hex, PublicClient } from 'viem'
import { zeroAddress } from 'viem'
import { V2_CONTRACTS } from '../contracts/addresses'
import {
  buildPreMigrateCall,
  buildPreMigrateMulticall,
  ENABLE_PRE_MIGRATE,
} from './buildPreMigrateCalls'
import {
  type ClassifiedName,
  classifyNames,
  type GroupedNames,
  groupClassifiedNames,
  is2LD,
} from './classifyNames'
import {
  filterFrozenApprovals,
  filterNotReserved,
  type PreFlightResult,
  resolveParentRegistries,
  runPreFlightChecks,
} from './preflightChecks'
import {
  isUserRejection,
  signUnwrappedTx,
  signWrappedTxs,
} from './signTransactions'
import type { V1Domain } from './v1SubgraphClient'

export class MigrationError extends TaggedError('MigrationError')<{
  cause: unknown
  step?: string
}> {}

export class MigrationUserRejectedError extends TaggedError(
  'MigrationUserRejectedError',
)<{
  step: string
}> {}

export type MigrationProgress = {
  readonly currentStep: number
  readonly totalSteps: number
  readonly description: string
  readonly txHash?: Hex
}

export type SkippedName = {
  readonly name: string
  readonly reason: 'not-premigrated' | 'frozen-approval' | 'transfer-failed'
}

export type MigrationResult = {
  readonly completed: number
  readonly txHashes: readonly Hex[]
  readonly skipped: readonly SkippedName[]
}

const has2LDNames = (groups: GroupedNames): boolean =>
  groups.unwrapped.length > 0 ||
  groups.unlocked.length > 0 ||
  groups.locked2ld.length > 0

const countSteps = (
  groups: GroupedNames,
  includePreMigrate: boolean,
): number => {
  let count = 0
  if (includePreMigrate) count++
  if (has2LDNames(groups)) count++
  count += groups.lockedChildren.size
  return count
}

export const executeMigration = async (params: {
  domains: V1Domain[]
  migrationOwner: Address
  defaultResolver: Address
  wagmiConfig: WagmiConfig
  publicClient: PublicClient
  onProgress: (progress: MigrationProgress) => void
}): Promise<MigrationResult> => {
  const {
    domains,
    migrationOwner,
    defaultResolver,
    wagmiConfig,
    publicClient,
    onProgress,
  } = params

  const classified = classifyNames(domains, migrationOwner)
  if (classified.length === 0) {
    return { completed: 0, txHashes: [], skipped: [] }
  }

  const preflight: PreFlightResult = ENABLE_PRE_MIGRATE
    ? await filterFrozenApprovals(publicClient, classified).then(
        (frozenResult) => ({
          valid: frozenResult.valid,
          notReserved: [] as ClassifiedName[],
          frozen: frozenResult.frozen,
        }),
      )
    : await runPreFlightChecks(publicClient, classified)

  const preflightSkipped: SkippedName[] = [
    ...preflight.notReserved.map((n) => ({
      name: n.domain.name,
      reason: 'not-premigrated' as const,
    })),
    ...preflight.frozen.map((n) => ({
      name: n.domain.name,
      reason: 'frozen-approval' as const,
    })),
  ]
  const skipped: SkippedName[] = [...preflightSkipped]

  if (preflight.valid.length === 0) {
    const reasons: string[] = []
    if (preflight.notReserved.length > 0) {
      const names = preflight.notReserved.map((n) => n.domain.name).join(', ')
      reasons.push(
        `Not yet premigrated in ENS v2: ${names}. These names must be premigrated before they can be migrated.`,
      )
    }
    if (preflight.frozen.length > 0) {
      const names = preflight.frozen.map((n) => n.domain.name).join(', ')
      reasons.push(
        `Frozen approval prevents migration: ${names}. These names have CANNOT_APPROVE with an active approval.`,
      )
    }
    throw new MigrationError({
      cause: new Error(reasons.join('\n')),
      step: 'Pre-flight checks',
    })
  }

  const validNames = preflight.valid

  const groups = groupClassifiedNames(validNames)
  const totalSteps = countSteps(groups, ENABLE_PRE_MIGRATE)
  const txHashes: Hex[] = []
  let stepIndex = 0

  // ── Step: Pre-migrate (sequential, must complete before transfers) ──
  if (ENABLE_PRE_MIGRATE) {
    const twoLDs = validNames.filter(is2LD)

    const { notReserved: needsPreMigrate } = await filterNotReserved(
      publicClient,
      twoLDs,
    )

    if (needsPreMigrate.length > 0) {
      onProgress({
        currentStep: stepIndex,
        totalSteps,
        description: `Pre-migrating ${needsPreMigrate.length} name(s)`,
      })

      try {
        let hash: Hex
        if (needsPreMigrate.length === 1 && needsPreMigrate[0]) {
          hash = await writeContract(
            wagmiConfig,
            buildPreMigrateCall(needsPreMigrate[0]),
          )
        } else {
          hash = await writeContract(
            wagmiConfig,
            buildPreMigrateMulticall(needsPreMigrate),
          )
        }
        onProgress({
          currentStep: stepIndex,
          totalSteps,
          description: 'Reserving your names on ENS v2!',
          txHash: hash,
        })
        await waitForTransactionReceipt(wagmiConfig, { hash })
        txHashes.push(hash)
      } catch (error) {
        if (isUserRejection(error)) {
          throw new MigrationUserRejectedError({ step: 'Pre-migrate' })
        }
        throw new MigrationError({ cause: error, step: 'Pre-migrate' })
      }

      stepIndex++
      onProgress({
        currentStep: stepIndex,
        totalSteps,
        description: 'Pre-migration complete',
        txHash: txHashes[txHashes.length - 1],
      })
    } else {
      stepIndex++
    }
  }

  // ── Step: 2LD migrations (sign sequentially, wait in parallel) ──
  if (has2LDNames(groups)) {
    const twoLDCount =
      groups.unwrapped.length + groups.unlocked.length + groups.locked2ld.length

    onProgress({
      currentStep: stepIndex,
      totalSteps,
      description: `Migrating ${twoLDCount} name(s)`,
    })

    const pendingHashes: Hex[] = []
    let signingError: { error: unknown; step: string } | null = null

    const signingSteps = [
      {
        names: groups.unwrapped,
        step: 'Unwrapped names',
        sign: async () => {
          const hash = await signUnwrappedTx({
            wagmiConfig,
            names: groups.unwrapped,
            migrationOwner,
            defaultResolver,
          })
          return { hashes: [hash], skipped: [] as SkippedName[] }
        },
      },
      {
        names: groups.unlocked,
        step: 'Unlocked names',
        sign: () =>
          signWrappedTxs({
            wagmiConfig,
            names: groups.unlocked,
            migrationOwner,
            defaultResolver,
            target: V2_CONTRACTS.UnlockedMigrationController,
          }),
      },
      {
        names: groups.locked2ld,
        step: 'Locked names',
        sign: () =>
          signWrappedTxs({
            wagmiConfig,
            names: groups.locked2ld,
            migrationOwner,
            defaultResolver,
            target: V2_CONTRACTS.LockedMigrationController,
          }),
      },
    ]

    for (const { names, step, sign } of signingSteps) {
      if (names.length === 0 || signingError) continue
      try {
        const result = await sign()
        pendingHashes.push(...result.hashes)
        skipped.push(...result.skipped)
      } catch (error) {
        signingError = { error, step }
      }
    }

    if (pendingHashes.length > 0) {
      onProgress({
        currentStep: stepIndex,
        totalSteps,
        description: 'Your names are on their way to v2!',
        txHash: pendingHashes[0],
      })

      await Promise.all(
        pendingHashes.map((hash) =>
          waitForTransactionReceipt(wagmiConfig, { hash }),
        ),
      )
      txHashes.push(...pendingHashes)
    }

    if (signingError) {
      if (isUserRejection(signingError.error)) {
        throw new MigrationUserRejectedError({ step: signingError.step })
      }
      throw new MigrationError({
        cause: signingError.error,
        step: signingError.step,
      })
    }

    stepIndex++
    onProgress({
      currentStep: stepIndex,
      totalSteps,
      description: '2LD names migrated',
      txHash: txHashes[txHashes.length - 1],
    })
  }

  // ── Steps: Locked children (resolve all parent registries in one batch, then sign per parent) ──
  const parentRegistries =
    groups.lockedChildren.size > 0
      ? await resolveParentRegistries(publicClient, groups.lockedChildren)
      : new Map<string, Address>()

  for (const [parentName, children] of groups.lockedChildren) {
    onProgress({
      currentStep: stepIndex,
      totalSteps,
      description: `Migrating subnames under ${parentName}`,
    })

    const wrapperRegistry = parentRegistries.get(parentName) ?? zeroAddress

    if (wrapperRegistry === zeroAddress) {
      throw new MigrationError({
        cause: new Error(
          `Parent "${parentName}" has not been migrated yet. Migrate the parent first.`,
        ),
        step: `Subnames under ${parentName}`,
      })
    }

    try {
      const result = await signWrappedTxs({
        wagmiConfig,
        names: children,
        migrationOwner,
        defaultResolver,
        target: wrapperRegistry,
      })
      skipped.push(...result.skipped)

      if (result.hashes.length > 0) {
        onProgress({
          currentStep: stepIndex,
          totalSteps,
          description: `Subnames joining ${parentName} in v2!`,
          txHash: result.hashes[0],
        })

        await Promise.all(
          result.hashes.map((hash) =>
            waitForTransactionReceipt(wagmiConfig, { hash }),
          ),
        )
        txHashes.push(...result.hashes)
      }
    } catch (error) {
      if (isUserRejection(error)) {
        throw new MigrationUserRejectedError({
          step: `Subnames under ${parentName}`,
        })
      }
      throw new MigrationError({
        cause: error,
        step: `Subnames under ${parentName}`,
      })
    }

    stepIndex++
    onProgress({
      currentStep: stepIndex,
      totalSteps,
      description: `Subnames under ${parentName} migrated`,
      txHash: txHashes[txHashes.length - 1],
    })
  }

  return {
    completed: validNames.length - (skipped.length - preflightSkipped.length),
    txHashes,
    skipped,
  }
}

export type MigrationStepDescriptor =
  | { type: 'pre-migrate'; count: number }
  | { type: 'migrate'; count: number }
  | { type: 'migrate-subnames'; count: number; parentName: string }

export const getMigrationStepInfo = (
  domains: V1Domain[],
  ownerAddress: Address,
): { stepCount: number; stepDescriptors: MigrationStepDescriptor[] } => {
  const classified = classifyNames(domains, ownerAddress)
  const groups = groupClassifiedNames(classified)
  const descriptors: MigrationStepDescriptor[] = []

  if (ENABLE_PRE_MIGRATE) {
    const twoLDCount = classified.filter(is2LD).length
    if (twoLDCount > 0) {
      descriptors.push({ type: 'pre-migrate', count: twoLDCount })
    }
  }

  if (has2LDNames(groups)) {
    const count =
      groups.unwrapped.length + groups.unlocked.length + groups.locked2ld.length
    descriptors.push({ type: 'migrate', count })
  }

  for (const [parentName, children] of groups.lockedChildren) {
    descriptors.push({
      type: 'migrate-subnames',
      count: children.length,
      parentName,
    })
  }

  return {
    stepCount: countSteps(groups, ENABLE_PRE_MIGRATE),
    stepDescriptors: descriptors,
  }
}
