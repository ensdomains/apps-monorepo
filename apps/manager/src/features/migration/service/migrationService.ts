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

import { BASE_REGISTRAR_ABI, NAME_WRAPPER_ABI } from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import type { MigrationPlan } from './buildMigrationPlan'
import { approvalNeedsFor, checkHelperApprovals } from './checkHelperApprovals'
import type {
  ClassifiedName,
  GroupedNames,
  IneligibleName,
} from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'
import { ensureOwnedPermRes } from './ensureOwnedPermRes'

export type { MigrationPlan } from './buildMigrationPlan'
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
  const approvals = await checkHelperApprovals({
    eoa: ctx.migrationOwner,
    helperAddress: V2_CONTRACTS.MigrationHelper,
    needs,
    wagmiConfig: ctx.wagmiConfig,
  })

  if (needs.hasUnwrapped && !approvals.baseRegistrarApproved) {
    ctx.tracker.emit(
      'Approving the migration helper on BaseRegistrar',
      PENDING_TX_HASH,
    )
    const hash = await writeContract(ctx.wagmiConfig, {
      address: V1_CONTRACTS.BaseRegistrar,
      abi: BASE_REGISTRAR_ABI,
      functionName: 'setApprovalForAll',
      args: [V2_CONTRACTS.MigrationHelper, true],
    })
    const receipt = await waitForTransactionReceipt(ctx.wagmiConfig, {
      hash,
      timeout: APPROVAL_RECEIPT_TIMEOUT_MS,
    })
    if (receipt.status !== 'success') {
      throw new MigrationError({
        cause: new Error(
          `BaseRegistrar setApprovalForAll(MigrationHelper) reverted (tx ${hash})`,
        ),
        step: 'Approving MigrationHelper',
      })
    }
    hashes.push(hash)
  }

  if (needs.hasWrapped && !approvals.nameWrapperApproved) {
    ctx.tracker.emit(
      'Approving the migration helper on NameWrapper',
      PENDING_TX_HASH,
    )
    const hash = await writeContract(ctx.wagmiConfig, {
      address: V1_CONTRACTS.NameWrapper,
      abi: NAME_WRAPPER_ABI,
      functionName: 'setApprovalForAll',
      args: [V2_CONTRACTS.MigrationHelper, true],
    })
    const receipt = await waitForTransactionReceipt(ctx.wagmiConfig, {
      hash,
      timeout: APPROVAL_RECEIPT_TIMEOUT_MS,
    })
    if (receipt.status !== 'success') {
      throw new MigrationError({
        cause: new Error(
          `NameWrapper setApprovalForAll(MigrationHelper) reverted (tx ${hash})`,
        ),
        step: 'Approving MigrationHelper',
      })
    }
    hashes.push(hash)
  }

  ctx.tracker.next()
  if (hashes.length > 0) {
    ctx.tracker.emit('Migration helper approved')
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

const buildEOARequest = (
  ctx: MigrationCtx,
  call: ZeroDevCall,
): TransactionRequest => {
  const chainId = ctx.publicClient.chain?.id
  if (!chainId) {
    throw new Error('publicClient is missing a chain configuration')
  }

  return {
    type: 'eoa',
    from: ctx.accountAddress,
    to: call.to,
    data: call.data,
    value: call.value,
    chainId,
  }
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

const submitCall = async (
  ctx: MigrationCtx,
  call: ZeroDevCall,
  description: string,
): Promise<Hex> => {
  const txId = transactionManager.startTransaction(
    { type: 'custom', request: buildEOARequest(ctx, call) },
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

export type OnBatchComplete = (names: readonly string[], txHash: Hex) => void
// Kept as OnBatchComplete to preserve the state-machine wiring — the event
// is still `migration.batchComplete`; semantically each "batch" is now a
// single submitted tx.

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
  const { classified, ineligible, groups, preflight, stepDescriptors } = plan

  if (classified.length === 0) {
    return { completed: 0, txHashes: [], ineligible: [...ineligible] }
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

  const txHashes: Hex[] = []

  // 1. Approvals
  if (!preflight.skipApprovalPhase) {
    const approvalHashes = await ensureApprovals(ctx, groups)
    txHashes.push(...approvalHashes)
  }

  // 2. Owned PermissionedResolver (existing flow)
  const namesToOwnedPermRes = classified.filter(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )
  await ensureResolver(ctx, namesToOwnedPermRes, preflight)

  // 3. Single migrate() call covering every name
  const allNames = classified.map((c) => c.domain.name)
  try {
    const migrateHash = await submitCall(
      ctx,
      plan.migrateCall,
      `Upgrading ${classified.length} name(s)`,
    )
    txHashes.push(migrateHash)
    onBatchComplete?.(allNames, migrateHash)
    ctx.tracker.next()
    ctx.tracker.emit('Names upgraded', migrateHash)
  } catch (error) {
    throw wrapBatchError(error, 'Migrate')
  }

  // 4. grantRoles per manager
  for (const call of plan.roleGrantCalls) {
    try {
      const hash = await submitCall(ctx, call, 'Granting manager role')
      txHashes.push(hash)
      ctx.tracker.next()
      ctx.tracker.emit('Role granted', hash)
    } catch (error) {
      throw wrapBatchError(error, 'Granting manager role')
    }
  }

  // 5. Profile replay
  for (const call of plan.profileReplayCalls) {
    try {
      const hash = await submitCall(ctx, call, 'Restoring profile records')
      txHashes.push(hash)
      ctx.tracker.next()
      ctx.tracker.emit('Profile restored', hash)
    } catch (error) {
      throw wrapBatchError(error, 'Restoring profile records')
    }
  }

  return {
    completed: classified.length,
    txHashes,
    ineligible: [...ineligible],
  }
}
