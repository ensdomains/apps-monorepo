import {
  type Signer,
  type TransactionRequest,
  transactionManager,
  waitForTransaction,
  type ZeroDevCall,
} from '@ens-apps/transaction-manager'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import {
  type Config as WagmiConfig,
  waitForTransactionReceipt,
  writeContract,
} from '@wagmi/core'
import type { Address, Hex, PublicClient } from 'viem'
import { namehash, zeroAddress } from 'viem'
import { customSepolia } from '@/lib/wagmi'
import { BASE_REGISTRAR_ABI, NAME_WRAPPER_ABI } from '../contracts/abis'
import { V1_CONTRACTS } from '../contracts/addresses'
import { buildAllTransferCalls } from './buildMigrationCalls'
import { buildPreMigrateCall } from './buildPreMigrateCalls'
import { buildProfileReplayCall } from './buildProfileReplayCalls'
import { buildRoleGrantCall } from './buildRoleGrantCalls'
import {
  buildStepDescriptors,
  type MigrationStepDescriptor,
} from './buildStepDescriptors'
import { approvalNeedsFor, checkSCAApprovals } from './checkSCAApprovals'
import {
  type ClassifiedName,
  classifyNames,
  type GroupedNames,
  groupClassifiedNames,
  type IneligibleName,
  is2LD,
} from './classifyNames'
import {
  EMPTY_PREFLIGHT,
  type MigrationPreflight,
} from './computeMigrationPreflight'
import { ensureOwnedPermRes } from './ensureOwnedPermRes'
import { fetchV1Profiles, type Profile, profileMapKey } from './fetchV1Profiles'
import { filterNotReserved, resolveParentRegistries } from './preflightChecks'
import type { V1Domain } from './v1SubgraphClient'

export type { MigrationStepDescriptor } from './buildStepDescriptors'
export type { MigrationPreflight } from './computeMigrationPreflight'

class MigrationError extends TaggedError('MigrationError')<{
  cause: unknown
  step?: string
}> {}

class MigrationUserRejectedError extends TaggedError(
  'MigrationUserRejectedError',
)<{
  step: string
}> {}

const isUserRejection = (error: unknown): boolean => {
  let cur: unknown = error
  while (cur instanceof Error) {
    if (cur.name === 'UserRejectedRequestError') return true
    if (/user rejected/i.test(cur.message)) return true
    cur = (cur as { cause?: unknown }).cause
  }
  return false
}

export type MigrationProgress = {
  readonly currentStep: number
  readonly totalSteps: number
  readonly description: string
  readonly txHash?: Hex
}

export type MigrationResult = {
  readonly completed: number
  readonly txHashes: readonly Hex[]
  readonly ineligible: readonly IneligibleName[]
  readonly migratedNames: readonly string[]
}

type Tracker = {
  emit: (description: string, txHash?: Hex) => void
  next: () => void
  getCurrentStep: () => number
  setTotalSteps: (nextTotal: number) => void
}

const createTracker = (
  onProgress: (progress: MigrationProgress) => void,
  initialTotalSteps: number,
): Tracker => {
  let currentStep = 0
  let totalSteps = initialTotalSteps
  return {
    emit(description, txHash) {
      onProgress({ currentStep, totalSteps, description, txHash })
    },
    next() {
      currentStep++
    },
    getCurrentStep() {
      return currentStep
    },
    setTotalSteps(nextTotal) {
      totalSteps = nextTotal
    },
  }
}

type MigrationCtx = {
  wagmiConfig: WagmiConfig
  publicClient: PublicClient
  signer: Signer
  accountAddress: Address
  migrationOwner: Address
  defaultResolver: Address
  tracker: Tracker
}

const PENDING_TX_HASH = '0x0' as Hex
const APPROVAL_RECEIPT_TIMEOUT_MS = 300_000

const ensureApprovals = async (
  ctx: MigrationCtx,
  groups: GroupedNames,
): Promise<Hex[]> => {
  const hashes: Hex[] = []
  const needs = approvalNeedsFor(groups)
  const approvals = await checkSCAApprovals({
    eoa: ctx.migrationOwner,
    scaAddress: ctx.accountAddress,
    needs,
    wagmiConfig: ctx.wagmiConfig,
  })

  if (needs.hasUnwrapped && !approvals.baseRegistrarApproved) {
    ctx.tracker.emit(
      'Approving your smart account on BaseRegistrar',
      PENDING_TX_HASH,
    )
    const hash = await writeContract(ctx.wagmiConfig, {
      address: V1_CONTRACTS.BaseRegistrar,
      abi: BASE_REGISTRAR_ABI,
      functionName: 'setApprovalForAll',
      args: [ctx.accountAddress, true],
    })
    await waitForTransactionReceipt(ctx.wagmiConfig, {
      hash,
      timeout: APPROVAL_RECEIPT_TIMEOUT_MS,
    })
    hashes.push(hash)
  }

  if (needs.hasWrapped && !approvals.nameWrapperApproved) {
    ctx.tracker.emit(
      'Approving your smart account on NameWrapper',
      PENDING_TX_HASH,
    )
    const hash = await writeContract(ctx.wagmiConfig, {
      address: V1_CONTRACTS.NameWrapper,
      abi: NAME_WRAPPER_ABI,
      functionName: 'setApprovalForAll',
      args: [ctx.accountAddress, true],
    })
    await waitForTransactionReceipt(ctx.wagmiConfig, {
      hash,
      timeout: APPROVAL_RECEIPT_TIMEOUT_MS,
    })
    hashes.push(hash)
  }

  ctx.tracker.next()
  if (hashes.length > 0) {
    ctx.tracker.emit('Smart account approved')
  }
  return hashes
}

const ensureResolver = async (
  ctx: MigrationCtx,
  namesToOwnedPermRes: readonly ClassifiedName[],
  preflight: MigrationPreflight,
): Promise<Address | null> => {
  if (namesToOwnedPermRes.length === 0) return preflight.preExistingOwnedPermRes

  if (preflight.preExistingOwnedPermRes)
    return preflight.preExistingOwnedPermRes

  ctx.tracker.emit('Setting up your v2 resolver', PENDING_TX_HASH)
  const resolver = await ensureOwnedPermRes({
    eoa: ctx.migrationOwner,
    wagmiConfig: ctx.wagmiConfig,
    publicClient: ctx.publicClient,
  })
  ctx.tracker.next()
  return resolver
}

const fetchProfilesIfNeeded = async (
  ctx: MigrationCtx,
  namesToOwnedPermRes: readonly ClassifiedName[],
  preflight: MigrationPreflight,
): Promise<Map<Hex, Profile>> => {
  if (namesToOwnedPermRes.length === 0 || preflight.skipFetchProfilesPhase) {
    return new Map()
  }
  return fetchV1Profiles({
    names: namesToOwnedPermRes
      .filter((n) => n.v1ResolverAddress)
      .map((n) => ({
        nodeHex: namehash(n.domain.name) as Hex,
        v1ResolverAddress: n.v1ResolverAddress as Address,
      })),
    publicClient: ctx.publicClient,
  })
}

const computeNotReservedSet = async (
  publicClient: PublicClient,
  classified: readonly ClassifiedName[],
): Promise<Set<string>> => {
  const twoLDs = classified.filter(is2LD)
  if (twoLDs.length === 0) return new Set()
  const notReserved = await filterNotReserved(publicClient, twoLDs)
  const out = new Set<string>()
  for (const name of notReserved) out.add(name.domain.name)
  return out
}

const validateSubnameParents = async (
  publicClient: PublicClient,
  groups: GroupedNames,
): Promise<Map<string, Address>> => {
  if (groups.childNames.size === 0) return new Map()

  const parentRegistries = await resolveParentRegistries(
    publicClient,
    groups.childNames,
  )

  const unresolvedParents: string[] = []
  for (const [parentName] of groups.childNames) {
    const registry = parentRegistries.get(parentName) ?? zeroAddress
    if (registry === zeroAddress) unresolvedParents.push(parentName)
  }
  if (unresolvedParents.length === 0) return parentRegistries

  const total = groups.childNames.size
  const resolved = total - unresolvedParents.length
  const preview = unresolvedParents.slice(0, 3).join(', ')
  const suffix =
    unresolvedParents.length > 3
      ? ` (+${unresolvedParents.length - 3} more)`
      : ''
  throw new MigrationError({
    cause: new Error(
      `${unresolvedParents.length}/${total} parent registries unresolved after retries: ${preview}${suffix}. Migrate the parent name(s) first, or retry once the indexer catches up.`,
    ),
    step: `Subnames (${resolved}/${total} parents ready)`,
  })
}

const buildSCARequest = (
  ctx: MigrationCtx,
  calls: ZeroDevCall[],
): TransactionRequest => {
  const firstCall = calls[0]
  if (!firstCall) throw new Error('No calls to submit')

  if (ctx.signer.type === 'zerodev') {
    return {
      type: 'zerodev',
      from: ctx.accountAddress,
      to: firstCall.to,
      data: firstCall.data,
      value: 0n,
      chainId: customSepolia.id,
      zerodevParams: {
        calls,
        sponsored: true,
      },
    } as TransactionRequest
  }

  return {
    type: 'rhinestone-intent',
    from: ctx.accountAddress,
    to: firstCall.to,
    data: firstCall.data,
    value: 0n,
    chainId: customSepolia.id,
    rhinestoneParams: {
      calls,
      sponsored: true,
    },
  } as TransactionRequest
}

const submitBatchedUserOp = async (
  ctx: MigrationCtx,
  calls: ZeroDevCall[],
  description: string,
): Promise<Hex> => {
  const request = buildSCARequest(ctx, calls)

  const txId = transactionManager.startTransaction(
    { type: 'custom', request },
    ctx.signer,
    {
      description,
      publicClient: ctx.publicClient,
    },
  )

  ctx.tracker.emit(description, PENDING_TX_HASH)

  const result = await waitForTransaction(txId)
  return result.hash as Hex
}

export const MAX_BATCH_RAW_BYTES = 500_000

type NameBundle = {
  name: ClassifiedName
  calls: ZeroDevCall[]
  bytes: number
}

const calcBundleBytes = (calls: readonly ZeroDevCall[]): number => {
  let total = 0
  for (const c of calls) {
    total += Math.max(0, (c.data.length - 2) / 2)
    total += 64
  }
  return total
}

const buildNameBundle = (params: {
  name: ClassifiedName
  migrationOwner: Address
  defaultResolver: Address
  ownedPermRes: Address | null
  notReservedSet: ReadonlySet<string>
  parentRegistries: ReadonlyMap<string, Address>
  profiles: ReadonlyMap<Hex, Profile>
}): NameBundle => {
  const {
    name,
    migrationOwner,
    defaultResolver,
    ownedPermRes,
    notReservedSet,
    parentRegistries,
    profiles,
  } = params
  const calls: ZeroDevCall[] = []

  if (is2LD(name) && notReservedSet.has(name.domain.name)) {
    calls.push(buildPreMigrateCall(name))
  }

  calls.push(
    ...buildAllTransferCalls({
      classified: [name],
      migrationOwner,
      defaultResolver,
      ownedPermRes,
      parentRegistries,
    }),
  )

  if (name.managerAddress) {
    calls.push(buildRoleGrantCall(name))
  }

  if (ownedPermRes && name.resolverStrategy === 'to-owned-permres') {
    const node = namehash(name.domain.name) as Hex
    const profile = profiles.get(profileMapKey(node))
    if (profile && (profile.texts.length > 0 || profile.addresses.length > 0)) {
      const replayCall = buildProfileReplayCall({
        resolver: ownedPermRes,
        profiles: new Map<Hex, Profile>([[node, profile]]),
      })
      if (replayCall) calls.push(replayCall)
    }
  }

  return { name, calls, bytes: calcBundleBytes(calls) }
}

export const packNamesByPayload = (params: {
  names: readonly ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
  ownedPermRes: Address | null
  notReservedSet: ReadonlySet<string>
  parentRegistries: ReadonlyMap<string, Address>
  profiles: ReadonlyMap<Hex, Profile>
  maxBatchBytes?: number
}): NameBundle[][] => {
  const { names, maxBatchBytes = MAX_BATCH_RAW_BYTES } = params
  const bundles = names.map((name) => buildNameBundle({ ...params, name }))
  const batches: NameBundle[][] = []
  let current: NameBundle[] = []
  let running = 0
  for (const b of bundles) {
    if (current.length > 0 && running + b.bytes > maxBatchBytes) {
      batches.push(current)
      current = []
      running = 0
    }
    current.push(b)
    running += b.bytes
  }
  if (current.length > 0) batches.push(current)
  return batches
}

const wrapBatchError = (
  error: unknown,
  step: string,
): MigrationUserRejectedError | MigrationError => {
  if (isUserRejection(error)) {
    return new MigrationUserRejectedError({ step })
  }
  return new MigrationError({ cause: error, step })
}

const submitBatches = async (params: {
  ctx: MigrationCtx
  classified: readonly ClassifiedName[]
  notReservedSet: ReadonlySet<string>
  ownedPermRes: Address | null
  profiles: ReadonlyMap<Hex, Profile>
  parentRegistries: ReadonlyMap<string, Address>
}): Promise<Hex[]> => {
  const {
    ctx,
    classified,
    notReservedSet,
    ownedPermRes,
    profiles,
    parentRegistries,
  } = params

  const batches = packNamesByPayload({
    names: classified,
    migrationOwner: ctx.migrationOwner,
    defaultResolver: ctx.defaultResolver,
    ownedPermRes,
    notReservedSet,
    parentRegistries,
    profiles,
  })

  const totalBatches = batches.length
  const preBatchSteps = ctx.tracker.getCurrentStep()
  ctx.tracker.setTotalSteps(preBatchSteps + totalBatches)

  const hashes: Hex[] = []

  for (let i = 0; i < batches.length; i++) {
    const bundle = batches[i]!
    const batchNum = i + 1
    const batchLabel = `Batch ${batchNum}/${totalBatches}`
    const nameCount = bundle.length

    ctx.tracker.emit(
      `Upgrading batch ${batchNum}/${totalBatches} (${nameCount} names)`,
    )

    const combinedCalls = bundle.flatMap((b) => b.calls)

    let lastHash: Hex
    try {
      lastHash = await submitBatchedUserOp(
        ctx,
        combinedCalls,
        `Migrate batch ${batchNum}/${totalBatches} (${nameCount} names)`,
      )
      hashes.push(lastHash)
    } catch (error) {
      throw wrapBatchError(error, batchLabel)
    }

    ctx.tracker.next()
    ctx.tracker.emit(`Batch ${batchNum}/${totalBatches} complete!`, lastHash)
  }

  return hashes
}

export const executeMigration = async (params: {
  domains: V1Domain[]
  migrationOwner: Address
  defaultResolver: Address
  wagmiConfig: WagmiConfig
  publicClient: PublicClient
  signer: Signer
  accountAddress: Address
  preflight?: MigrationPreflight
  onProgress: (progress: MigrationProgress) => void
}): Promise<MigrationResult> => {
  const {
    domains,
    migrationOwner,
    defaultResolver,
    wagmiConfig,
    publicClient,
    signer,
    accountAddress,
    preflight = EMPTY_PREFLIGHT,
    onProgress,
  } = params

  const { classified, ineligible } = classifyNames(domains, migrationOwner)
  if (classified.length === 0) {
    return { completed: 0, txHashes: [], ineligible, migratedNames: [] }
  }

  const groups = groupClassifiedNames(classified)
  const totalSteps = buildStepDescriptors(classified, groups, preflight).length
  const ctx: MigrationCtx = {
    wagmiConfig,
    publicClient,
    signer,
    accountAddress,
    migrationOwner,
    defaultResolver,
    tracker: createTracker(onProgress, totalSteps),
  }

  const approvalHashes = preflight.skipApprovalPhase
    ? []
    : await ensureApprovals(ctx, groups)

  const namesToOwnedPermRes = classified.filter(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )

  const ownedPermRes = await ensureResolver(ctx, namesToOwnedPermRes, preflight)

  ctx.tracker.emit(`Preparing migration for ${classified.length} name(s)`)

  const [profiles, notReservedSet, parentRegistries] = await Promise.all([
    fetchProfilesIfNeeded(ctx, namesToOwnedPermRes, preflight),
    computeNotReservedSet(publicClient, classified),
    validateSubnameParents(publicClient, groups),
  ])

  const batchHashes = await submitBatches({
    ctx,
    classified,
    notReservedSet,
    ownedPermRes,
    profiles,
    parentRegistries,
  })

  return {
    completed: classified.length,
    txHashes: [...approvalHashes, ...batchHashes],
    ineligible,
    migratedNames: classified.map((c) => c.domain.name),
  }
}

export const getMigrationStepInfo = (
  domains: V1Domain[],
  ownerAddress: Address,
  preflight: MigrationPreflight = EMPTY_PREFLIGHT,
): {
  stepCount: number
  stepDescriptors: MigrationStepDescriptor[]
  ineligible: IneligibleName[]
} => {
  const { classified, ineligible } = classifyNames(domains, ownerAddress)
  const groups = groupClassifiedNames(classified)
  const descriptors = buildStepDescriptors(classified, groups, preflight)

  return {
    stepCount: descriptors.length,
    stepDescriptors: descriptors,
    ineligible,
  }
}
