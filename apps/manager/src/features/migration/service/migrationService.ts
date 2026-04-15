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
} from './buildPreMigrateCalls'
import {
  type ClassifiedName,
  classifyNames,
  type GroupedNames,
  groupClassifiedNames,
  type IneligibleName,
  is2LD,
} from './classifyNames'
import { filterNotReserved, resolveParentRegistries } from './preflightChecks'
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

export type MigrateBucket = 'unwrapped' | 'unlocked' | 'locked-2ld'

export type MigrationStepDescriptor =
  | { type: 'pre-migrate'; count: number }
  | { type: 'approve-multicall3'; count: number }
  | { type: 'migrate'; count: number; bucket: MigrateBucket }
  | { type: 'migrate-subnames'; count: number; parentName: string }

const needsMulticall3Approval = (groups: GroupedNames): boolean =>
  groups.unwrapped.length >= 2

const buildStepDescriptors = (
  classified: readonly ClassifiedName[],
  groups: GroupedNames,
): MigrationStepDescriptor[] => {
  const descriptors: MigrationStepDescriptor[] = []

  const twoLDCount = classified.filter(is2LD).length
  if (twoLDCount > 0) {
    descriptors.push({ type: 'pre-migrate', count: twoLDCount })
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

type Tracker = {
  emit: (description: string, txHash?: Hex) => void
  next: () => void
}

const createTracker = (
  onProgress: (progress: MigrationProgress) => void,
  totalSteps: number,
): Tracker => {
  let currentStep = 0
  return {
    emit(description, txHash) {
      onProgress({ currentStep, totalSteps, description, txHash })
    },
    next() {
      currentStep++
    },
  }
}

const wrapTxStep = async <T>(
  step: string,
  fn: () => Promise<T>,
): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    if (isUserRejection(error)) {
      throw new MigrationUserRejectedError({ step })
    }
    throw new MigrationError({ cause: error, step })
  }
}

type MigrationCtx = {
  wagmiConfig: WagmiConfig
  publicClient: PublicClient
  migrationOwner: Address
  defaultResolver: Address
  tracker: Tracker
}

type PhaseResult = {
  hashes: Hex[]
  skipped: SkippedName[]
  completed: number
}

const runPreMigrateStep = async (
  ctx: MigrationCtx,
  twoLDs: readonly ClassifiedName[],
): Promise<Hex[]> => {
  if (twoLDs.length === 0) return []

  const { notReserved } = await filterNotReserved(ctx.publicClient, [...twoLDs])

  if (notReserved.length === 0) {
    ctx.tracker.next()
    ctx.tracker.emit('Pre-migration not needed')
    return []
  }

  ctx.tracker.emit(`Pre-migrating ${notReserved.length} name(s)`)

  const hash = await wrapTxStep('Pre-migrate', () => {
    const only = notReserved[0]
    if (notReserved.length === 1 && only) {
      return writeContract(ctx.wagmiConfig, buildPreMigrateCall(only))
    }
    return writeContract(ctx.wagmiConfig, buildPreMigrateMulticall(notReserved))
  })

  ctx.tracker.emit('Reserving your names on ENS v2!', hash)
  await waitForTransactionReceipt(ctx.wagmiConfig, {
    hash,
    timeout: TX_RECEIPT_TIMEOUT_MS,
  })

  ctx.tracker.next()
  ctx.tracker.emit('Pre-migration complete', hash)
  return [hash]
}

const approveMulticall3IfNeeded = async (
  ctx: MigrationCtx,
  groups: GroupedNames,
): Promise<Hex[]> => {
  if (!needsMulticall3Approval(groups)) return []

  const isApproved = (await readContract(ctx.wagmiConfig, {
    address: V1_CONTRACTS.BaseRegistrar,
    abi: BASE_REGISTRAR_ABI,
    functionName: 'isApprovedForAll',
    args: [ctx.migrationOwner, MULTICALL3_ADDRESS],
  })) as boolean

  let hash: Hex | undefined
  if (!isApproved) {
    ctx.tracker.emit('Approving Multicall3 to batch your unwrapped names')
    hash = await wrapTxStep('Multicall3 approval', () =>
      writeContract(ctx.wagmiConfig, {
        address: V1_CONTRACTS.BaseRegistrar,
        abi: BASE_REGISTRAR_ABI,
        functionName: 'setApprovalForAll',
        args: [MULTICALL3_ADDRESS, true],
      }),
    )
    ctx.tracker.emit('Approving Multicall3 to batch your unwrapped names', hash)
    await waitForTransactionReceipt(ctx.wagmiConfig, {
      hash,
      timeout: TX_RECEIPT_TIMEOUT_MS,
    })
  }

  ctx.tracker.next()
  ctx.tracker.emit('Multicall3 approved', hash)
  return hash ? [hash] : []
}

const migrateRootBuckets = async (
  ctx: MigrationCtx,
  groups: GroupedNames,
): Promise<PhaseResult> => {
  const { wagmiConfig, migrationOwner, defaultResolver } = ctx
  const result: PhaseResult = { hashes: [], skipped: [], completed: 0 }

  const buckets = [
    {
      step: 'Unwrapped names',
      label: 'unwrapped',
      names: groups.unwrapped,
      sign: () =>
        signUnwrappedTxs({
          wagmiConfig,
          names: groups.unwrapped,
          migrationOwner,
          defaultResolver,
        }),
    },
    {
      step: 'Unlocked names',
      label: 'unlocked',
      names: groups.unlocked,
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
      step: 'Locked names',
      label: 'locked',
      names: groups.locked2ld,
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

  for (const bucket of buckets) {
    if (bucket.names.length === 0) continue

    ctx.tracker.emit(`Migrating ${bucket.names.length} ${bucket.label} name(s)`)
    const bucketResult = await wrapTxStep(bucket.step, bucket.sign)

    result.skipped.push(...bucketResult.skipped)
    result.completed += bucket.names.length - bucketResult.skipped.length
    result.hashes.push(...bucketResult.hashes)

    if (bucketResult.hashes.length > 0) {
      ctx.tracker.emit(
        'Your names are on their way to v2!',
        bucketResult.hashes[0],
      )
    }
    ctx.tracker.next()
  }

  return result
}

const waitForRootReceipts = async (
  ctx: MigrationCtx,
  hashes: readonly Hex[],
): Promise<void> => {
  if (hashes.length === 0) return

  ctx.tracker.emit(
    `Confirming ${hashes.length} transaction(s)...`,
    hashes[hashes.length - 1],
  )
  await Promise.all(
    hashes.map((hash) =>
      waitForTransactionReceipt(ctx.wagmiConfig, {
        hash,
        timeout: TX_RECEIPT_TIMEOUT_MS,
      }),
    ),
  )
}

const migrateSubnames = async (
  ctx: MigrationCtx,
  groups: GroupedNames,
): Promise<PhaseResult> => {
  const result: PhaseResult = { hashes: [], skipped: [], completed: 0 }
  if (groups.childNames.size === 0) return result

  const parentRegistries = await resolveParentRegistries(
    ctx.publicClient,
    groups.childNames,
  )

  for (const [parentName, children] of groups.childNames) {
    ctx.tracker.emit(`Migrating subnames under ${parentName}`)

    const wrapperRegistry = parentRegistries.get(parentName) ?? zeroAddress
    if (wrapperRegistry === zeroAddress) {
      throw new MigrationError({
        cause: new Error(
          `Parent "${parentName}" has not been migrated yet. Migrate the parent first.`,
        ),
        step: `Subnames under ${parentName}`,
      })
    }

    const step = `Subnames under ${parentName}`
    const bucketResult = await wrapTxStep(step, () =>
      signWrappedTxs({
        wagmiConfig: ctx.wagmiConfig,
        names: children,
        migrationOwner: ctx.migrationOwner,
        defaultResolver: ctx.defaultResolver,
        target: wrapperRegistry,
      }),
    )

    result.skipped.push(...bucketResult.skipped)
    result.completed += children.length - bucketResult.skipped.length
    result.hashes.push(...bucketResult.hashes)

    if (bucketResult.hashes.length > 0) {
      ctx.tracker.emit(
        `Subnames joining ${parentName} in v2!`,
        bucketResult.hashes[0],
      )
      await Promise.all(
        bucketResult.hashes.map((hash) =>
          waitForTransactionReceipt(ctx.wagmiConfig, {
            hash,
            timeout: TX_RECEIPT_TIMEOUT_MS,
          }),
        ),
      )
    }

    ctx.tracker.next()
    ctx.tracker.emit(
      `Subnames under ${parentName} migrated`,
      bucketResult.hashes[bucketResult.hashes.length - 1],
    )
  }

  return result
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

  const groups = groupClassifiedNames(classified)
  const totalSteps = buildStepDescriptors(classified, groups).length
  const ctx: MigrationCtx = {
    wagmiConfig,
    publicClient,
    migrationOwner,
    defaultResolver,
    tracker: createTracker(onProgress, totalSteps),
  }

  const preMigrateHashes = await runPreMigrateStep(
    ctx,
    classified.filter(is2LD),
  )
  const approvalHashes = await approveMulticall3IfNeeded(ctx, groups)
  const root = await migrateRootBuckets(ctx, groups)
  await waitForRootReceipts(ctx, root.hashes)
  const subnames = await migrateSubnames(ctx, groups)

  return {
    completed: root.completed + subnames.completed,
    txHashes: [
      ...preMigrateHashes,
      ...approvalHashes,
      ...root.hashes,
      ...subnames.hashes,
    ],
    skipped: [...root.skipped, ...subnames.skipped],
    ineligible,
  }
}

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
  const descriptors = buildStepDescriptors(classified, groups)

  return {
    stepCount: descriptors.length,
    stepDescriptors: descriptors,
    ineligible,
  }
}
