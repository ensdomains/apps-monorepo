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
import { customSepolia } from '@/lib/wagmi'
import { BASE_REGISTRAR_ABI, NAME_WRAPPER_ABI } from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import {
  type MigrationPlan,
  type NameBundle,
  resolveDeferredBatches,
} from './buildMigrationPlan'
import { approvalNeedsFor, checkSCAApprovals } from './checkSCAApprovals'
import type {
  ClassifiedName,
  GroupedNames,
  IneligibleName,
} from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'
import { ensureOwnedPermRes } from './ensureOwnedPermRes'

export type { MigrationPlan, NameBundle } from './buildMigrationPlan'
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
    const receipt = await waitForTransactionReceipt(ctx.wagmiConfig, {
      hash,
      timeout: APPROVAL_RECEIPT_TIMEOUT_MS,
    })
    if (receipt.status !== 'success') {
      throw new MigrationError({
        cause: new Error(
          `BaseRegistrar setApprovalForAll reverted (tx ${hash})`,
        ),
        step: 'Approving SCA',
      })
    }
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
    const receipt = await waitForTransactionReceipt(ctx.wagmiConfig, {
      hash,
      timeout: APPROVAL_RECEIPT_TIMEOUT_MS,
    })
    if (receipt.status !== 'success') {
      throw new MigrationError({
        cause: new Error(`NameWrapper setApprovalForAll reverted (tx ${hash})`),
        step: 'Approving SCA',
      })
    }
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

const wrapBatchError = (
  error: unknown,
  step: string,
): MigrationUserRejectedError | MigrationError => {
  if (isUserRejection(error)) {
    return new MigrationUserRejectedError({ step })
  }
  return new MigrationError({ cause: error, step })
}

export type OnBatchComplete = (names: readonly string[], txHash: Hex) => void

const submitBatches = async (
  ctx: MigrationCtx,
  batches: readonly NameBundle[][],
  onBatchComplete?: OnBatchComplete,
): Promise<Hex[]> => {
  const totalBatches = batches.length
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

    onBatchComplete?.(
      bundle.map((b) => b.name.domain.name),
      lastHash,
    )

    ctx.tracker.next()
    ctx.tracker.emit(`Batch ${batchNum}/${totalBatches} complete!`, lastHash)
  }

  return hashes
}

export const executeMigration = async (params: {
  plan: MigrationPlan
  wagmiConfig: WagmiConfig
  publicClient: PublicClient
  signer: Signer
  accountAddress: Address
  onProgress: (progress: MigrationProgress) => void
  onBatchComplete?: OnBatchComplete
}): Promise<MigrationResult> => {
  const {
    plan,
    wagmiConfig,
    publicClient,
    signer,
    accountAddress,
    onProgress,
    onBatchComplete,
  } = params
  const {
    classified,
    ineligible,
    groups,
    preflight,
    batches,
    stepDescriptors,
  } = plan

  if (classified.length === 0) {
    return {
      completed: 0,
      txHashes: [],
      ineligible: [...ineligible],
    }
  }

  const ctx: MigrationCtx = {
    wagmiConfig,
    publicClient,
    signer,
    accountAddress,
    migrationOwner: plan.migrationOwner,
    defaultResolver: V2_CONTRACTS.ENSV2Resolver,
    tracker: createTracker(onProgress, stepDescriptors.length),
  }

  const approvalHashes = preflight.skipApprovalPhase
    ? []
    : await ensureApprovals(ctx, groups)

  const namesToOwnedPermRes = classified.filter(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )
  await ensureResolver(ctx, namesToOwnedPermRes, preflight)

  const batchHashes = await submitBatches(ctx, batches, onBatchComplete)

  let deferredHashes: Hex[] = []
  if (plan.deferredBatches.length > 0) {
    const rebuilt = await resolveDeferredBatches({ plan, publicClient })
    deferredHashes = await submitBatches(ctx, rebuilt, onBatchComplete)
  }

  return {
    completed: classified.length,
    txHashes: [...approvalHashes, ...batchHashes, ...deferredHashes],
    ineligible: [...ineligible],
  }
}
