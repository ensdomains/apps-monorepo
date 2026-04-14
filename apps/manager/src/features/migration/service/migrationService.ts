import { TaggedError } from '@ens-apps/utils/neverthrow'
import {
  readContract,
  type Config as WagmiConfig,
  waitForTransactionReceipt,
  writeContract,
} from '@wagmi/core'
import type { Address, Hex, PublicClient } from 'viem'
import { zeroAddress } from 'viem'
import { BASE_REGISTRAR_ABI } from '../contracts/abis'
import {
  MULTICALL3_ADDRESS,
  V1_CONTRACTS,
  V2_CONTRACTS,
} from '../contracts/addresses'
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
  type IneligibleName,
  is2LD,
} from './classifyNames'
import {
  filterAlreadyMigrated,
  filterFrozenApprovals,
  filterNotReserved,
  type PreFlightResult,
  resolveParentRegistries,
  runPreFlightChecks,
} from './preflightChecks'
import {
  isUserRejection,
  signUnwrappedTxs,
  signWrappedTxs,
} from './signTransactions'
import type { V1Domain } from './v1SubgraphClient'

const TX_RECEIPT_TIMEOUT_MS = 5 * 60 * 1000

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

export type SkipReason =
  | 'not-premigrated'
  | 'frozen-approval'
  | 'transfer-failed'
  | 'invalid-data'
  | 'name-data-mismatch'
  | 'name-is-locked'
  | 'name-not-locked'
  | 'frozen-token-approval'
  | 'already-migrated'

export type SkippedName = {
  readonly name: string
  readonly reason: SkipReason
}

export type MigrationResult = {
  readonly completed: number
  readonly txHashes: readonly Hex[]
  readonly skipped: readonly SkippedName[]
  readonly ineligible: readonly IneligibleName[]
}

const needsMulticall3Approval = (groups: GroupedNames): boolean =>
  groups.unwrapped.length >= 2

const buildStepDescriptors = (
  classified: readonly ClassifiedName[],
  groups: GroupedNames,
  includePreMigrate: boolean,
): MigrationStepDescriptor[] => {
  const descriptors: MigrationStepDescriptor[] = []

  if (includePreMigrate) {
    const twoLDCount = classified.filter(is2LD).length
    if (twoLDCount > 0) {
      descriptors.push({ type: 'pre-migrate', count: twoLDCount })
    }
  }

  if (needsMulticall3Approval(groups)) {
    descriptors.push({
      type: 'approve-multicall3',
      count: groups.unwrapped.length,
    })
  }

  if (groups.unwrapped.length > 0) {
    descriptors.push({
      type: 'migrate',
      count: groups.unwrapped.length,
      bucket: 'unwrapped',
    })
  }
  if (groups.unlocked.length > 0) {
    descriptors.push({
      type: 'migrate',
      count: groups.unlocked.length,
      bucket: 'unlocked',
    })
  }
  if (groups.locked2ld.length > 0) {
    descriptors.push({
      type: 'migrate',
      count: groups.locked2ld.length,
      bucket: 'locked-2ld',
    })
  }

  for (const [parentName, children] of groups.childNames) {
    descriptors.push({
      type: 'migrate-subnames',
      count: children.length,
      parentName,
    })
  }

  return descriptors
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

  const { classified, ineligible } = classifyNames(domains, migrationOwner)
  if (classified.length === 0) {
    return { completed: 0, txHashes: [], skipped: [], ineligible }
  }

  const preflight: PreFlightResult = ENABLE_PRE_MIGRATE
    ? await (async () => {
        const [frozenResult, migratedResult] = await Promise.all([
          filterFrozenApprovals(publicClient, classified),
          filterAlreadyMigrated(publicClient, classified, migrationOwner),
        ])
        const excluded = new Set<string>([
          ...frozenResult.frozen.map((n) => n.domain.id),
          ...migratedResult.alreadyMigrated.map((n) => n.domain.id),
        ])
        return {
          valid: classified.filter((n) => !excluded.has(n.domain.id)),
          notReserved: [] as ClassifiedName[],
          frozen: frozenResult.frozen,
          alreadyMigrated: migratedResult.alreadyMigrated,
        }
      })()
    : await runPreFlightChecks(publicClient, classified, migrationOwner)

  const skipped: SkippedName[] = [
    ...preflight.notReserved.map((n) => ({
      name: n.domain.name,
      reason: 'not-premigrated' as const,
    })),
    ...preflight.frozen.map((n) => ({
      name: n.domain.name,
      reason: 'frozen-approval' as const,
    })),
    ...preflight.alreadyMigrated.map((n) => ({
      name: n.domain.name,
      reason: 'already-migrated' as const,
    })),
  ]

  if (preflight.valid.length === 0) {
    return {
      completed: 0,
      txHashes: [],
      skipped,
      ineligible,
    }
  }

  const validNames = preflight.valid

  const groups = groupClassifiedNames(validNames)
  const totalSteps = buildStepDescriptors(
    validNames,
    groups,
    ENABLE_PRE_MIGRATE,
  ).length
  const txHashes: Hex[] = []
  let stepIndex = 0
  let migratedCount = 0

  const twoLDs = validNames.filter(is2LD)
  if (ENABLE_PRE_MIGRATE && twoLDs.length > 0) {
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
        await waitForTransactionReceipt(wagmiConfig, {
          hash,
          timeout: TX_RECEIPT_TIMEOUT_MS,
        })
        txHashes.push(hash)
      } catch (error) {
        if (isUserRejection(error)) {
          throw new MigrationUserRejectedError({ step: 'Pre-migrate' })
        }
        throw new MigrationError({ cause: error, step: 'Pre-migrate' })
      }
    }

    stepIndex++
    onProgress({
      currentStep: stepIndex,
      totalSteps,
      description: 'Pre-migration complete',
      txHash: txHashes[txHashes.length - 1],
    })
  }

  if (needsMulticall3Approval(groups)) {
    const isApproved = (await readContract(wagmiConfig, {
      address: V1_CONTRACTS.BaseRegistrar,
      abi: BASE_REGISTRAR_ABI,
      functionName: 'isApprovedForAll',
      args: [migrationOwner, MULTICALL3_ADDRESS],
    })) as boolean

    if (!isApproved) {
      onProgress({
        currentStep: stepIndex,
        totalSteps,
        description: 'Approving Multicall3 to batch your unwrapped names',
      })
      try {
        const hash = await writeContract(wagmiConfig, {
          address: V1_CONTRACTS.BaseRegistrar,
          abi: BASE_REGISTRAR_ABI,
          functionName: 'setApprovalForAll',
          args: [MULTICALL3_ADDRESS, true],
        })
        await waitForTransactionReceipt(wagmiConfig, {
          hash,
          timeout: TX_RECEIPT_TIMEOUT_MS,
        })
        txHashes.push(hash)
      } catch (error) {
        if (isUserRejection(error)) {
          throw new MigrationUserRejectedError({ step: 'Multicall3 approval' })
        }
        throw new MigrationError({
          cause: error,
          step: 'Multicall3 approval',
        })
      }
    }

    stepIndex++
    onProgress({
      currentStep: stepIndex,
      totalSteps,
      description: 'Multicall3 approved',
      txHash: txHashes[txHashes.length - 1],
    })
  }

  const signingSteps = [
    {
      names: groups.unwrapped,
      step: 'Unwrapped names',
      label: 'unwrapped',
      sign: () =>
        signUnwrappedTxs({
          wagmiConfig,
          names: groups.unwrapped,
          migrationOwner,
          defaultResolver,
        }),
    },
    {
      names: groups.unlocked,
      step: 'Unlocked names',
      label: 'unlocked',
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
      label: 'locked',
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

  const pendingBucketHashes: Hex[] = []

  for (const { names, step, label, sign } of signingSteps) {
    if (names.length === 0) continue

    onProgress({
      currentStep: stepIndex,
      totalSteps,
      description: `Migrating ${names.length} ${label} name(s)`,
    })

    let bucketResult: Awaited<ReturnType<typeof sign>>
    try {
      bucketResult = await sign()
    } catch (error) {
      if (isUserRejection(error)) {
        throw new MigrationUserRejectedError({ step })
      }
      throw new MigrationError({ cause: error, step })
    }

    skipped.push(...bucketResult.skipped)
    migratedCount += names.length - bucketResult.skipped.length

    if (bucketResult.hashes.length > 0) {
      pendingBucketHashes.push(...bucketResult.hashes)
      txHashes.push(...bucketResult.hashes)
      onProgress({
        currentStep: stepIndex,
        totalSteps,
        description: 'Your names are on their way to v2!',
        txHash: bucketResult.hashes[0],
      })
    }

    stepIndex++
  }

  if (pendingBucketHashes.length > 0) {
    onProgress({
      currentStep: stepIndex,
      totalSteps,
      description: `Confirming ${pendingBucketHashes.length} transaction(s)...`,
      txHash: pendingBucketHashes[pendingBucketHashes.length - 1],
    })
    await Promise.all(
      pendingBucketHashes.map((hash) =>
        waitForTransactionReceipt(wagmiConfig, {
          hash,
          timeout: TX_RECEIPT_TIMEOUT_MS,
        }),
      ),
    )
  }

  const parentRegistries =
    groups.childNames.size > 0
      ? await resolveParentRegistries(publicClient, groups.childNames)
      : new Map<string, Address>()

  for (const [parentName, children] of groups.childNames) {
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
      migratedCount += children.length - result.skipped.length

      if (result.hashes.length > 0) {
        onProgress({
          currentStep: stepIndex,
          totalSteps,
          description: `Subnames joining ${parentName} in v2!`,
          txHash: result.hashes[0],
        })

        await Promise.all(
          result.hashes.map((hash) =>
            waitForTransactionReceipt(wagmiConfig, {
              hash,
              timeout: TX_RECEIPT_TIMEOUT_MS,
            }),
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
    completed: migratedCount,
    txHashes,
    skipped,
    ineligible,
  }
}

export type MigrateBucket = 'unwrapped' | 'unlocked' | 'locked-2ld'

export type MigrationStepDescriptor =
  | { type: 'pre-migrate'; count: number }
  | { type: 'approve-multicall3'; count: number }
  | { type: 'migrate'; count: number; bucket: MigrateBucket }
  | { type: 'migrate-subnames'; count: number; parentName: string }

export const getMigrationStepInfo = (
  domains: V1Domain[],
  ownerAddress: Address,
): {
  stepCount: number
  stepDescriptors: MigrationStepDescriptor[]
  ineligible: IneligibleName[]
} => {
  const { classified, ineligible } = classifyNames(domains, ownerAddress)
  const groups = groupClassifiedNames(classified)
  const descriptors = buildStepDescriptors(
    classified,
    groups,
    ENABLE_PRE_MIGRATE,
  )

  return {
    stepCount: descriptors.length,
    stepDescriptors: descriptors,
    ineligible,
  }
}
