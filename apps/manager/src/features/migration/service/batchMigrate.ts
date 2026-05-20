import type { Erc4337Call } from '@ens-apps/transaction-manager'
import type { Address, PublicClient } from 'viem'
import {
  GAS_HEURISTIC,
  MAX_NAMES_HINT,
  PER_BATCH_OVERHEAD,
  TARGET_GAS,
} from './batchMigrate.constants'
import { buildMigrateCall } from './buildMigrateCall'
import type { ClassifiedName, MigrationTokenType } from './classifyNames'

export type PartitionOpts = {
  readonly maxNamesHint: number
  readonly targetGas: bigint
  readonly perBatchOverhead: bigint
  readonly gasHeuristic: Record<MigrationTokenType, bigint>
}

const topoSort = (classified: readonly ClassifiedName[]): ClassifiedName[] => {
  const byName = new Map<string, ClassifiedName>()
  for (const n of classified) byName.set(n.domain.name, n)

  const childrenByParent = new Map<string, ClassifiedName[]>()
  const inDegree = new Map<string, number>()
  for (const n of classified) inDegree.set(n.domain.name, 0)

  for (const n of classified) {
    const isChild =
      n.tokenType === 'locked-child' || n.tokenType === 'detached-child'
    if (!isChild || !n.parentName) continue
    if (!byName.has(n.parentName)) continue
    inDegree.set(n.domain.name, 1)
    const siblings = childrenByParent.get(n.parentName) ?? []
    siblings.push(n)
    childrenByParent.set(n.parentName, siblings)
  }

  const queue: ClassifiedName[] = []
  for (const n of classified) {
    if (inDegree.get(n.domain.name) === 0) queue.push(n)
  }

  const result: ClassifiedName[] = []
  let i = 0
  while (i < queue.length) {
    const node = queue[i++]!
    result.push(node)
    const kids = childrenByParent.get(node.domain.name) ?? []
    for (const kid of kids) {
      const deg = (inDegree.get(kid.domain.name) ?? 0) - 1
      inDegree.set(kid.domain.name, deg)
      if (deg === 0) queue.push(kid)
    }
  }

  if (result.length < classified.length) {
    const emitted = new Set(result.map((n) => n.domain.name))
    for (const n of classified) {
      if (!emitted.has(n.domain.name)) result.push(n)
    }
  }

  return result
}

export const partitionForMigrate = (
  classified: readonly ClassifiedName[],
  opts: PartitionOpts,
): ClassifiedName[][] => {
  if (classified.length === 0) return []
  const sorted = topoSort(classified)

  const batches: ClassifiedName[][] = []
  let current: ClassifiedName[] = []
  let currentGas = opts.perBatchOverhead

  for (const n of sorted) {
    const nameGas = opts.gasHeuristic[n.tokenType]
    const overflowCount = current.length >= opts.maxNamesHint
    const overflowGas = currentGas + nameGas > opts.targetGas

    if (current.length > 0 && (overflowCount || overflowGas)) {
      batches.push(current)
      current = []
      currentGas = opts.perBatchOverhead
    }
    current.push(n)
    currentGas += nameGas
  }
  if (current.length > 0) batches.push(current)
  return batches
}

export type MigrationBatch = {
  readonly index: number
  readonly names: readonly string[]
  readonly estimatedGas: bigint
}

export type BuildBatchedMigrateCallsParams = {
  readonly classified: readonly ClassifiedName[]
  readonly migrationOwner: Address
  readonly defaultResolver: Address
  readonly ownedPermRes: Address | null
  readonly maxNamesHint?: number
  readonly targetGas?: bigint
}

export type BuildBatchedMigrateCallsOutput = {
  readonly calls: readonly Erc4337Call[]
  readonly batches: readonly MigrationBatch[]
}

const heuristicGasFor = (batch: readonly ClassifiedName[]): bigint => {
  let g = PER_BATCH_OVERHEAD
  for (const n of batch) g += GAS_HEURISTIC[n.tokenType]
  return g
}

export const buildBatchedMigrateCalls = (
  params: BuildBatchedMigrateCallsParams,
): BuildBatchedMigrateCallsOutput => {
  const {
    classified,
    migrationOwner,
    defaultResolver,
    ownedPermRes,
    maxNamesHint = MAX_NAMES_HINT,
    targetGas = TARGET_GAS,
  } = params

  const partitions = partitionForMigrate(classified, {
    maxNamesHint,
    targetGas,
    perBatchOverhead: PER_BATCH_OVERHEAD,
    gasHeuristic: GAS_HEURISTIC,
  })

  const calls: Erc4337Call[] = []
  const batches: MigrationBatch[] = []

  for (const [index, partition] of partitions.entries()) {
    const call = buildMigrateCall({
      classified: partition,
      migrationOwner,
      defaultResolver,
      ownedPermRes,
    })
    calls.push(call)
    batches.push({
      index,
      names: partition.map((n) => n.domain.name),
      estimatedGas: heuristicGasFor(partition),
    })
  }

  return { calls, batches }
}

type MutablePlan = {
  calls: Erc4337Call[]
  batches: MigrationBatch[]
}

export type VerifyOrSplitParams = {
  readonly publicClient: PublicClient
  readonly account: Address
  readonly mutablePlan: MutablePlan
  readonly index: number
  /** ClassifiedName arrays keyed by batch index; mutated in-place when we split. */
  readonly migrateBatchClassified: Record<number, ClassifiedName[]>
  readonly targetGas: bigint
  readonly migrationOwner: Address
  readonly defaultResolver: Address
  readonly ownedPermRes: Address | null
}

const splitMigrateBatch = (
  classifiedForBatch: ClassifiedName[],
  params: Pick<
    VerifyOrSplitParams,
    'migrationOwner' | 'defaultResolver' | 'ownedPermRes'
  >,
): {
  leftCall: Erc4337Call
  rightCall: Erc4337Call
  leftClassified: ClassifiedName[]
  rightClassified: ClassifiedName[]
} => {
  const mid = Math.ceil(classifiedForBatch.length / 2)
  const left = classifiedForBatch.slice(0, mid)
  const right = classifiedForBatch.slice(mid)
  return {
    leftClassified: left,
    rightClassified: right,
    leftCall: buildMigrateCall({
      classified: left,
      migrationOwner: params.migrationOwner,
      defaultResolver: params.defaultResolver,
      ownedPermRes: params.ownedPermRes,
    }),
    rightCall: buildMigrateCall({
      classified: right,
      migrationOwner: params.migrationOwner,
      defaultResolver: params.defaultResolver,
      ownedPermRes: params.ownedPermRes,
    }),
  }
}

export const verifyOrSplit = async (
  p: VerifyOrSplitParams,
): Promise<Erc4337Call> => {
  const {
    publicClient,
    account,
    mutablePlan,
    index,
    migrateBatchClassified,
    targetGas,
    migrationOwner,
    defaultResolver,
    ownedPermRes,
  } = p

  const call = mutablePlan.calls[index]
  if (!call) throw new Error(`verifyOrSplit: no call at index ${index}`)

  const est = await publicClient.estimateGas({
    account,
    to: call.to,
    data: call.data,
    value: call.value,
  })

  if (est <= targetGas) {
    mutablePlan.batches[index] = {
      ...mutablePlan.batches[index]!,
      estimatedGas: est,
    }
    return call
  }

  const cls = migrateBatchClassified[index] ?? []
  if (cls.length <= 1) {
    throw new Error(
      `verifyOrSplit: single-name batch '${cls[0]?.domain.name ?? '?'}' estimated at ${est} gas; exceeds budget ${targetGas}`,
    )
  }

  const { leftCall, rightCall, leftClassified, rightClassified } =
    splitMigrateBatch(cls, { migrationOwner, defaultResolver, ownedPermRes })

  mutablePlan.calls.splice(index, 1, leftCall, rightCall)
  const oldBatch = mutablePlan.batches[index]!
  mutablePlan.batches.splice(
    index,
    1,
    {
      index,
      names: leftClassified.map((n) => n.domain.name),
      estimatedGas: oldBatch.estimatedGas,
    },
    {
      index: index + 1,
      names: rightClassified.map((n) => n.domain.name),
      estimatedGas: oldBatch.estimatedGas,
    },
  )
  for (let j = index + 2; j < mutablePlan.batches.length; j++) {
    mutablePlan.batches[j] = { ...mutablePlan.batches[j]!, index: j }
  }
  const shifted: Record<number, ClassifiedName[]> = {}
  for (const k of Object.keys(migrateBatchClassified).map(Number)) {
    if (k > index) {
      shifted[k + 1] = migrateBatchClassified[k]!
    }
  }
  for (const k of Object.keys(shifted).map(Number)) {
    migrateBatchClassified[k] = shifted[k]!
  }
  migrateBatchClassified[index] = leftClassified
  migrateBatchClassified[index + 1] = rightClassified

  return verifyOrSplit({ ...p, index })
}
