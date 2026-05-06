import {
  type EOASigner,
  type Signer,
  type TransactionRequest,
  transactionManager,
  waitForTransaction,
  type ZeroDevCall,
} from '@ens-apps/transaction-manager'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import type { Config as WagmiConfig } from '@wagmi/core'
import type { Address, Hex, PublicClient } from 'viem'

import { V2_CONTRACTS } from '../contracts/addresses'
import {
  type MigrationPlan,
  type NameBundle,
  resolveDeferredBatches,
} from './buildMigrationPlan'
import type { ClassifiedName, IneligibleName } from './classifyNames'
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
  signer: EOASigner
  accountAddress: Address
  migrationOwner: Address
  defaultResolver: Address
  tracker: Tracker
}

const PENDING_TX_HASH = '0x0' as Hex

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

const submitEOACalls = async (
  ctx: MigrationCtx,
  calls: ZeroDevCall[],
  description: string,
): Promise<Hex> => {
  let lastHash: Hex | undefined
  for (const [i, call] of calls.entries()) {
    const stepDescription =
      calls.length > 1
        ? `${description} (${i + 1}/${calls.length})`
        : description

    const txId = transactionManager.startTransaction(
      { type: 'custom', request: buildEOARequest(ctx, call) },
      ctx.signer,
      {
        description: stepDescription,
        publicClient: ctx.publicClient,
      },
    )

    ctx.tracker.emit(stepDescription, PENDING_TX_HASH)

    const result = await waitForTransaction(txId)
    lastHash = result.hash as Hex
  }

  if (!lastHash) throw new Error('No calls to submit')
  return lastHash
}

const requireEOASigner = (
  signer: Signer,
  accountAddress: Address,
): EOASigner => {
  if (signer.type !== 'eoa') {
    throw new MigrationError({
      cause: new Error('Migration must be submitted from the connected EOA'),
      step: 'Preparing migration',
    })
  }
  const signerAddress = signer.walletClient.account?.address
  if (
    signerAddress &&
    signerAddress.toLowerCase() !== accountAddress.toLowerCase()
  ) {
    throw new MigrationError({
      cause: new Error('Migration signer does not match the migration account'),
      step: 'Preparing migration',
    })
  }
  return signer
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

  for (const [i, bundle] of batches.entries()) {
    const batchNum = i + 1
    const batchLabel = `Batch ${batchNum}/${totalBatches}`
    const nameCount = bundle.length

    ctx.tracker.emit(
      `Upgrading batch ${batchNum}/${totalBatches} (${nameCount} names)`,
    )

    const combinedCalls = bundle.flatMap((b) => b.calls)

    let lastHash: Hex
    try {
      lastHash = await submitEOACalls(
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
  const { classified, ineligible, preflight, batches, stepDescriptors } = plan

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
    signer: requireEOASigner(signer, accountAddress),
    accountAddress,
    migrationOwner: plan.migrationOwner,
    defaultResolver: V2_CONTRACTS.ENSV2Resolver,
    tracker: createTracker(onProgress, stepDescriptors.length),
  }

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
    txHashes: [...batchHashes, ...deferredHashes],
    ineligible: [...ineligible],
  }
}
