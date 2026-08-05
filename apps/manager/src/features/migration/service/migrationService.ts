import {
  buildHcaDeploymentCall,
  verifyStandaloneHca,
} from '@ens-apps/smart-account'
import {
  type Call,
  type Signer,
  type TransactionRequest,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { Config as WagmiConfig } from '@wagmi/core'
import type { Address, Hex, PublicClient, TransactionReceipt } from 'viem'

import { OPERATOR_APPROVAL_ABI } from '../contracts/abis'
import { V2_CONTRACTS } from '../contracts/addresses'
import { TARGET_GAS } from './batchMigrate.constants'
import { buildAtomicMigrationBatches } from './buildAtomicMigrationBatches'
import { adjustPlanForRetry, type MigrationPlan } from './buildMigrationPlan'
import { approvalNeedsFor } from './checkHelperApprovals'
import type { IneligibleName } from './classifyNames'
import {
  loadMigrationApprovalLedger,
  type MigrationApprovalLedgerScope,
  mergeMigrationApprovalLedgers,
  persistMigrationApprovalLedger,
} from './migrationApprovalLedger'
import {
  buildMigrationApprovalCall,
  checkMigrationApprovals,
  type MigrationApproval,
  planMigrationApprovals,
  trackCreatedMigrationApproval,
} from './migrationApprovals'
import { checkDeterministicMigrationResolverReadiness } from './migrationInvariants'
import {
  reconcileAtomicMigrationBatch,
  verifyAtomicMigrationBatch,
} from './verifyAtomicMigrationBatch'

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
  let current: unknown = error
  while (current instanceof Error) {
    if (current.name === 'UserRejectedRequestError') return true
    if (/user rejected/i.test(current.message)) return true
    current = (current as { cause?: unknown }).cause
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
  /** Tracked grants which could not yet be cleared. Migration is complete. */
  readonly cleanupPending: readonly MigrationApproval[]
}

export type MigrationCleanupResult = {
  readonly txHashes: readonly Hex[]
  readonly pending: readonly MigrationApproval[]
  readonly error?: unknown
}

type Tracker = {
  emit: (description: string, txHash?: Hex) => void
  next: () => void
  complete: (description: string, txHash?: Hex) => void
}

const createTracker = (
  onProgress: (progress: MigrationProgress) => void,
  totalSteps: number,
): Tracker => {
  let currentStep = 0
  const normalizedTotal = Math.max(totalSteps, 1)
  const emit = (description: string, txHash?: Hex) => {
    onProgress({
      currentStep,
      totalSteps: normalizedTotal,
      description,
      txHash,
    })
  }
  return {
    emit,
    next() {
      currentStep = Math.min(currentStep + 1, normalizedTotal)
    },
    complete(description, txHash) {
      if (currentStep >= normalizedTotal) return
      currentStep = normalizedTotal
      emit(description, txHash)
    },
  }
}

type MigrationCtx = {
  readonly wagmiConfig: WagmiConfig
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly walletAddress: Address
  readonly hcaAddress: Address
  readonly tracker: Tracker
}

const approvalLedgerScope = (
  ctx: Pick<MigrationCtx, 'publicClient' | 'walletAddress' | 'hcaAddress'>,
): MigrationApprovalLedgerScope => {
  const chainId = ctx.publicClient.chain?.id
  if (!chainId) {
    throw new Error('publicClient is missing a chain configuration')
  }
  return {
    chainId,
    owner: ctx.walletAddress,
    hca: ctx.hcaAddress,
  }
}

const PENDING_TX_HASH = '0x0' as Hex
const RECEIPT_TIMEOUT_MS = 300_000

const buildEOARequest = (
  ctx: Pick<MigrationCtx, 'publicClient' | 'walletAddress'>,
  call: Call,
): TransactionRequest => {
  const chainId = ctx.publicClient.chain?.id
  if (!chainId) {
    throw new Error('publicClient is missing a chain configuration')
  }

  return {
    type: 'eoa',
    from: ctx.walletAddress,
    to: call.to,
    data: call.data,
    value: call.value,
    chainId,
  }
}

const wrapMigrationError = (
  error: unknown,
  step: string,
): MigrationUserRejectedError | MigrationError =>
  isUserRejection(error)
    ? new MigrationUserRejectedError({ step })
    : new MigrationError({ cause: error, step })

const submitCall = async (
  ctx: MigrationCtx,
  call: Call,
  description: string,
): Promise<{ readonly hash: Hex; readonly receipt: TransactionReceipt }> => {
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
  const hash = result.hash as Hex
  const receipt = await ctx.publicClient.waitForTransactionReceipt({
    hash,
    timeout: RECEIPT_TIMEOUT_MS,
  })
  if (receipt.status !== 'success') {
    throw new Error(`${description} reverted (tx ${hash})`)
  }
  return { hash, receipt }
}

const hasCode = (code: Hex | undefined): boolean =>
  Boolean(code && code !== '0x')

const ensureHcaDeployment = async (params: {
  readonly ctx: MigrationCtx
  readonly hcaClient: Pick<RhinestoneAccount, 'getAddress' | 'getInitData'>
  readonly refreshAccount: () => Promise<void>
  readonly plannedDeployment: boolean
}): Promise<Hex | null> => {
  const { ctx, hcaClient, refreshAccount, plannedDeployment } = params
  const code = await ctx.publicClient.getCode({ address: ctx.hcaAddress })

  if (!hasCode(code)) {
    try {
      const { hash } = await submitCall(
        ctx,
        buildHcaDeploymentCall({
          client: hcaClient,
          chainId: ctx.publicClient.chain?.id ?? 11155111,
          expectedHca: ctx.hcaAddress,
          expectedOwner: ctx.walletAddress,
        }),
        'Setting up your HCA',
      )
      await verifyStandaloneHca({
        publicClient: ctx.publicClient,
        hca: ctx.hcaAddress,
        expectedOwner: ctx.walletAddress,
        chainId: ctx.publicClient.chain?.id ?? 11155111,
      })
      await refreshAccount()
      ctx.tracker.next()
      ctx.tracker.emit('HCA ready', hash)
      return hash
    } catch (error) {
      throw wrapMigrationError(error, 'Setting up HCA')
    }
  }

  await verifyStandaloneHca({
    publicClient: ctx.publicClient,
    hca: ctx.hcaAddress,
    expectedOwner: ctx.walletAddress,
    chainId: ctx.publicClient.chain?.id ?? 11155111,
  })
  // A retry can reuse an HCA deployed by the previous attempt. The preview
  // still contains the deployment descriptor, so consume that planned step
  // even though no second transaction is sent.
  if (plannedDeployment) {
    ctx.tracker.next()
    ctx.tracker.emit('HCA already ready')
  }
  return null
}

const approvalDescription = (approval: MigrationApproval): string => {
  switch (approval.id) {
    case 'base-registrar:migration-helper':
      return 'Allowing the migration helper'
    case 'base-registrar:hca':
      return 'Allowing your HCA to migrate registrations'
    case 'name-wrapper:migration-helper':
      return 'Allowing the migration helper to move wrapped names'
    case 'name-wrapper:hca':
      return 'Allowing your HCA to migrate wrapped names'
    case 'eth-registry:hca':
      return 'Allowing your HCA to restore managers'
  }
}

const ensureMigrationApprovals = async (params: {
  readonly ctx: MigrationCtx
  readonly plan: MigrationPlan
  readonly initialLedger: readonly MigrationApproval[]
  readonly onApprovalCreated?: (approval: MigrationApproval) => void
}): Promise<{
  readonly hashes: readonly Hex[]
  readonly ledger: readonly MigrationApproval[]
}> => {
  const { ctx, plan, onApprovalCreated } = params
  const basicNeeds = approvalNeedsFor(plan.groups)
  const needs = {
    ...basicNeeds,
    requiresManagerRestoration: plan.classified.some(
      (name) => name.managerAddress !== null,
    ),
  }
  const status = await checkMigrationApprovals({
    eoa: ctx.walletAddress,
    hcaAddress: ctx.hcaAddress,
    helperAddress: V2_CONTRACTS.MigrationHelper,
    needs,
    wagmiConfig: ctx.wagmiConfig,
  })
  const missing = planMigrationApprovals({
    hcaAddress: ctx.hcaAddress,
    helperAddress: V2_CONTRACTS.MigrationHelper,
    needs,
    status,
  })

  const hashes: Hex[] = []
  const scope = approvalLedgerScope(ctx)
  let ledger = mergeMigrationApprovalLedgers(
    params.initialLedger,
    loadMigrationApprovalLedger(scope),
  )
  const missingById = new Map(
    missing.map((approval) => [approval.id, approval]),
  )
  const plannedApprovals = plan.preflight.migrationApprovals ?? []
  const orderedApprovals = [
    ...plannedApprovals.map((approval) => ({
      approval,
      missing: missingById.get(approval.id),
    })),
    ...missing
      .filter(
        (approval) =>
          !plannedApprovals.some((planned) => planned.id === approval.id),
      )
      .map((approval) => ({ approval, missing: approval })),
  ]

  for (const { approval, missing: missingApproval } of orderedApprovals) {
    if (!missingApproval) {
      ctx.tracker.next()
      ctx.tracker.emit('Permission already confirmed')
      continue
    }
    const description = approvalDescription(approval)
    try {
      // Persist before asking the wallet to sign. If broadcasting or receipt
      // polling becomes uncertain, a reload still knows which exact grant may
      // need removal. Cleanup checks on-chain state before sending a revoke.
      ledger = trackCreatedMigrationApproval(ledger, approval)
      persistMigrationApprovalLedger(scope, ledger)
      onApprovalCreated?.(approval)
      const { hash } = await submitCall(
        ctx,
        buildMigrationApprovalCall(approval, true),
        description,
      )
      hashes.push(hash)
      ctx.tracker.next()
      ctx.tracker.emit('Permission confirmed', hash)
    } catch (error) {
      throw wrapMigrationError(error, description)
    }
  }
  return { hashes, ledger }
}

const removeNames = <T extends { readonly domain: { readonly name: string } }>(
  names: readonly T[],
  completedNames: readonly string[],
): T[] => {
  const completed = new Set(completedNames)
  return names.filter((name) => !completed.has(name.domain.name))
}

type MigrationRetryReconciliation = {
  readonly completedNameGroups: readonly (readonly string[])[]
  readonly incompleteNames: readonly string[]
}

/**
 * Reconciles each name from the immutable preview plan before rebuilding any
 * live transaction. A read failure is deliberately allowed to escape so a
 * retry cannot turn uncertain chain state into a duplicate migration attempt.
 */
const reconcileMigrationRetry = async (params: {
  readonly publicClient: PublicClient
  readonly plan: MigrationPlan
}): Promise<MigrationRetryReconciliation> => {
  const expectedNames = new Set(
    params.plan.classified.map(({ domain }) => domain.name),
  )
  const plannedExecutions = params.plan.atomicBatches.flatMap((batch) =>
    batch.nameExecutions
      .filter(({ classified }) => expectedNames.has(classified.domain.name))
      .map((nameExecution) => ({ batch, nameExecution })),
  )
  const plannedNames = plannedExecutions.map(
    ({ nameExecution }) => nameExecution.classified.domain.name,
  )
  const uniquePlannedNames = new Set(plannedNames)
  const duplicateNames = [...uniquePlannedNames].filter(
    (name) => plannedNames.filter((candidate) => candidate === name).length > 1,
  )
  if (duplicateNames.length > 0) {
    throw new Error(
      `Retry reconciliation plan contains duplicate expectations for: ${duplicateNames.join(', ')}`,
    )
  }

  const missingNames = [...expectedNames].filter(
    (name) => !uniquePlannedNames.has(name),
  )
  if (missingNames.length > 0) {
    throw new Error(
      `Retry reconciliation plan is missing expectations for: ${missingNames.join(', ')}`,
    )
  }

  const namesWithoutExpectations = plannedExecutions
    .filter(
      ({ nameExecution }) =>
        nameExecution.verificationExpectations.length === 0,
    )
    .map(({ nameExecution }) => nameExecution.classified.domain.name)
  if (namesWithoutExpectations.length > 0) {
    throw new Error(
      `Retry reconciliation plan has no verification expectations for: ${namesWithoutExpectations.join(', ')}`,
    )
  }

  const reconciled = await Promise.all(
    plannedExecutions.map(async ({ batch, nameExecution }) => ({
      batchIndex: batch.index,
      name: nameExecution.classified.domain.name,
      reconciliation: await reconcileAtomicMigrationBatch({
        publicClient: params.publicClient,
        batch: {
          index: batch.index,
          verificationExpectations: nameExecution.verificationExpectations,
        },
      }),
    })),
  )
  const completedNameGroups = params.plan.atomicBatches
    .map((batch) =>
      reconciled
        .filter(
          ({ batchIndex, reconciliation }) =>
            batchIndex === batch.index && reconciliation.status === 'complete',
        )
        .map(({ name }) => name),
    )
    .filter((names) => names.length > 0)
  const incompleteNames = reconciled
    .filter(({ reconciliation }) => reconciliation.status === 'incomplete')
    .map(({ name }) => name)

  return { completedNameGroups, incompleteNames }
}

const buildNextAtomicBatch = async (params: {
  readonly ctx: MigrationCtx
  readonly plan: MigrationPlan
  readonly remaining: MigrationPlan['classified']
}) => {
  const { ctx, plan, remaining } = params
  const resolverReadiness = await checkDeterministicMigrationResolverReadiness({
    publicClient: ctx.publicClient,
    hca: ctx.hcaAddress,
    wallet: ctx.walletAddress,
  })
  let livePrefixStart: string | undefined
  const atomicPlan = await buildAtomicMigrationBatches({
    chainId: ctx.publicClient.chain?.id ?? 11155111,
    hca: ctx.hcaAddress,
    wallet: ctx.walletAddress,
    classified: remaining,
    profiles: plan.profiles,
    defaultResolver: V2_CONTRACTS.DefaultResolver,
    resolverDeployed: resolverReadiness.status === 'verified',
    walletCoAdminGranted:
      resolverReadiness.status === 'verified' &&
      resolverReadiness.walletHasWildcardRoles,
    maxOuterGas: TARGET_GAS,
    estimateOuterGas: async ({ call, names }) => {
      const firstName = names[0]
      livePrefixStart ??= firstName
      // Later provisional batches may depend on a parent/resolver created by
      // the first batch. They are discarded and rebuilt after the first batch
      // confirms, so only live-estimate the executable leading prefix.
      if (firstName !== livePrefixStart) return 1n
      return ctx.publicClient.estimateGas({
        account: ctx.walletAddress,
        to: call.to,
        data: call.data,
        value: call.value,
      })
    },
  })
  const batch = atomicPlan.batches[0]
  if (!batch) throw new Error('Atomic migration did not produce a batch')
  return batch
}

export type OnBatchComplete = (names: readonly string[], txHash?: Hex) => void

export type OnApprovalChanged = (approval: MigrationApproval) => void

const prepareExecutionPlan = async (params: {
  readonly reconcileBeforeSubmit: boolean
  readonly publicClient: PublicClient
  readonly plan: MigrationPlan
  readonly ctx: MigrationCtx
  readonly onBatchComplete?: OnBatchComplete
}): Promise<MigrationPlan> => {
  if (!params.reconcileBeforeSubmit) return params.plan

  try {
    const reconciliation = await reconcileMigrationRetry({
      publicClient: params.publicClient,
      plan: params.plan,
    })
    const incompleteNames = new Set(reconciliation.incompleteNames)
    const completedNames = params.plan.classified
      .filter(({ domain }) => !incompleteNames.has(domain.name))
      .map(({ domain }) => domain.name)
    const executionPlan = adjustPlanForRetry(params.plan, completedNames)

    for (const names of reconciliation.completedNameGroups) {
      params.onBatchComplete?.(names)
      params.ctx.tracker.next()
      params.ctx.tracker.emit(
        names.length === 1
          ? `Recovered verified migration for ${names[0]}`
          : `Recovered ${names.length} verified migrations`,
      )
    }

    return executionPlan
  } catch (error) {
    throw wrapMigrationError(error, 'Reconciling previous atomic migration')
  }
}

const executeRemainingAtomicBatches = async (params: {
  readonly ctx: MigrationCtx
  readonly plan: MigrationPlan
  readonly publicClient: PublicClient
  readonly onBatchComplete?: OnBatchComplete
}): Promise<readonly Hex[]> => {
  const hashes: Hex[] = []
  let remaining = [...params.plan.classified]

  while (remaining.length > 0) {
    const batch = await buildNextAtomicBatch({
      ctx: params.ctx,
      plan: params.plan,
      remaining,
    })
    const description =
      batch.names.length === 1
        ? `Atomically upgrading ${batch.names[0]}`
        : `Atomically upgrading ${batch.names.length} names`

    try {
      const { hash, receipt } = await submitCall(
        params.ctx,
        batch.outerCall,
        description,
      )
      await verifyAtomicMigrationBatch({
        publicClient: params.publicClient,
        batch,
        blockNumber: receipt.blockNumber,
      })
      hashes.push(hash)
      params.onBatchComplete?.(batch.names, hash)
      remaining = removeNames(remaining, batch.names)
      params.ctx.tracker.next()
      params.ctx.tracker.emit('Atomic batch verified', hash)
    } catch (error) {
      throw wrapMigrationError(error, description)
    }
  }

  return hashes
}

export const executeMigrationCleanup = async (params: {
  readonly approvals: readonly MigrationApproval[]
  readonly wagmiConfig: WagmiConfig
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly walletAddress: Address
  readonly hcaAddress: Address
  readonly onProgress?: (progress: MigrationProgress) => void
  readonly onApprovalRemoved?: OnApprovalChanged
  /** Reuse the active migration tracker when cleanup is part of the same run. */
  readonly tracker?: Tracker
  /** The active migration plan represents cleanup as one aggregate step. */
  readonly plannedCleanupStep?: boolean
}): Promise<MigrationCleanupResult> => {
  const scope = approvalLedgerScope({
    publicClient: params.publicClient,
    walletAddress: params.walletAddress,
    hcaAddress: params.hcaAddress,
  })
  let pending = mergeMigrationApprovalLedgers(
    params.approvals,
    loadMigrationApprovalLedger(scope),
  )
  const tracker =
    params.tracker ??
    createTracker(params.onProgress ?? (() => undefined), pending.length)
  const ctx: MigrationCtx = {
    wagmiConfig: params.wagmiConfig,
    publicClient: params.publicClient,
    signer: params.signer,
    walletAddress: params.walletAddress,
    hcaAddress: params.hcaAddress,
    tracker,
  }
  const hashes: Hex[] = []
  let lastCompletedHash: Hex | undefined

  const markApprovalRemoved = (description: string, hash?: Hex) => {
    if (params.tracker && params.plannedCleanupStep) {
      tracker.emit(description, hash)
      lastCompletedHash = hash ?? lastCompletedHash
      return
    }
    tracker.next()
    tracker.emit(description, hash)
  }

  for (const approval of [...pending].reverse()) {
    try {
      const isActive = await params.publicClient.readContract({
        address: approval.contractAddress,
        abi: OPERATOR_APPROVAL_ABI,
        functionName: 'isApprovedForAll',
        args: [params.walletAddress, approval.operatorAddress],
      })
      if (!isActive) {
        pending = pending.filter((candidate) => candidate.id !== approval.id)
        persistMigrationApprovalLedger(scope, pending)
        params.onApprovalRemoved?.(approval)
        markApprovalRemoved('Temporary permission already removed')
        continue
      }

      const { hash } = await submitCall(
        ctx,
        buildMigrationApprovalCall(approval, false),
        'Removing temporary permission',
      )
      hashes.push(hash)
      pending = pending.filter((candidate) => candidate.id !== approval.id)
      persistMigrationApprovalLedger(scope, pending)
      params.onApprovalRemoved?.(approval)
      markApprovalRemoved('Temporary permission removed', hash)
    } catch (error) {
      return { txHashes: hashes, pending, error }
    }
  }

  if (params.tracker && params.plannedCleanupStep) {
    tracker.next()
    tracker.emit('Temporary permissions removed', lastCompletedHash)
  }

  return { txHashes: hashes, pending }
}

export const executeMigration = async (params: {
  readonly plan: MigrationPlan
  readonly wagmiConfig: WagmiConfig
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly hcaClient: Pick<RhinestoneAccount, 'getAddress' | 'getInitData'>
  readonly refreshAccount: () => Promise<void>
  readonly onProgress: (progress: MigrationProgress) => void
  readonly onBatchComplete?: OnBatchComplete
  readonly createdApprovals?: readonly MigrationApproval[]
  readonly onApprovalCreated?: OnApprovalChanged
  readonly onApprovalRemoved?: OnApprovalChanged
  /** Set on retry to reconcile a receipt whose post-state polling was uncertain. */
  readonly reconcileBeforeSubmit?: boolean
}): Promise<MigrationResult> => {
  const {
    plan,
    wagmiConfig,
    publicClient,
    signer,
    hcaClient,
    refreshAccount,
    onProgress,
    onBatchComplete,
  } = params
  const { classified, ineligible } = plan

  const scope: MigrationApprovalLedgerScope = {
    chainId: publicClient.chain?.id ?? 11155111,
    owner: plan.migrationOwner,
    hca: plan.hcaAddress,
  }
  let createdApprovals = mergeMigrationApprovalLedgers(
    params.createdApprovals ?? [],
    loadMigrationApprovalLedger(scope),
  )

  if (classified.length === 0) {
    return {
      completed: 0,
      txHashes: [],
      ineligible: [...ineligible],
      cleanupPending: createdApprovals,
    }
  }

  const ctx: MigrationCtx = {
    wagmiConfig,
    publicClient,
    signer,
    walletAddress: plan.migrationOwner,
    hcaAddress: plan.hcaAddress,
    tracker: createTracker(onProgress, plan.stepDescriptors.length),
  }
  const txHashes: Hex[] = []

  const executionPlan = await prepareExecutionPlan({
    reconcileBeforeSubmit: params.reconcileBeforeSubmit ?? false,
    publicClient,
    plan,
    ctx,
    onBatchComplete,
  })

  if (executionPlan.classified.length > 0) {
    const deploymentHash = await ensureHcaDeployment({
      ctx,
      hcaClient,
      refreshAccount,
      plannedDeployment: executionPlan.hcaDeploymentRequired,
    })
    if (deploymentHash) txHashes.push(deploymentHash)

    const approvals = await ensureMigrationApprovals({
      ctx,
      plan: executionPlan,
      initialLedger: createdApprovals,
      onApprovalCreated: params.onApprovalCreated,
    })
    txHashes.push(...approvals.hashes)
    createdApprovals = approvals.ledger

    txHashes.push(
      ...(await executeRemainingAtomicBatches({
        ctx,
        plan: executionPlan,
        publicClient,
        onBatchComplete,
      })),
    )
  }

  const cleanup = await executeMigrationCleanup({
    approvals: createdApprovals,
    wagmiConfig,
    publicClient,
    signer,
    walletAddress: plan.migrationOwner,
    hcaAddress: plan.hcaAddress,
    tracker: ctx.tracker,
    plannedCleanupStep: plan.stepDescriptors.some(
      (descriptor) => descriptor.type === 'cleanup',
    ),
    onApprovalRemoved: (approval) => {
      createdApprovals = createdApprovals.filter(
        (candidate) => candidate.id !== approval.id,
      )
      params.onApprovalRemoved?.(approval)
    },
  })
  txHashes.push(...cleanup.txHashes)
  if (cleanup.pending.length === 0) {
    ctx.tracker.complete('Migration complete', txHashes.at(-1))
  }

  return {
    completed: classified.length,
    txHashes,
    ineligible: [...ineligible],
    cleanupPending: cleanup.pending,
  }
}
