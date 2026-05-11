import {
  type EOASigner,
  type Signer,
  type TransactionRequest,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import type { Config as WagmiConfig } from '@wagmi/core'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
} from 'viem'

import { BASE_REGISTRAR_ABI, NAME_WRAPPER_ABI } from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import type { MigrationCall } from './buildMigrationCalls'
import type { MigrationPlan } from './buildMigrationPlan'
import type { IneligibleName } from './classifyNames'

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
  publicClient: PublicClient
  signer: EOASigner
  accountAddress: Address
  tracker: Tracker
}

const PENDING_TX_HASH = '0x0' as Hex

const buildEOARequest = (
  ctx: MigrationCtx,
  call: MigrationCall,
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

const submitEOACall = async (
  ctx: MigrationCtx,
  call: MigrationCall,
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

const wrapMigrationError = (
  error: unknown,
  step: string,
): MigrationUserRejectedError | MigrationError => {
  if (isUserRejection(error)) {
    return new MigrationUserRejectedError({ step })
  }
  return new MigrationError({ cause: error, step })
}

const buildApprovalCall = (params: {
  token: Address
  abi: typeof BASE_REGISTRAR_ABI | typeof NAME_WRAPPER_ABI
}): MigrationCall => ({
  to: params.token,
  data: encodeFunctionData({
    abi: params.abi,
    functionName: 'setApprovalForAll',
    args: [V2_CONTRACTS.MigrationHelper, true],
  }),
  value: 0n,
})

const submitApprovalIfNeeded = async (params: {
  ctx: MigrationCtx
  needed: boolean
  token: Address
  abi: typeof BASE_REGISTRAR_ABI | typeof NAME_WRAPPER_ABI
  description: string
  step: string
}): Promise<Hex | null> => {
  if (!params.needed) return null

  try {
    const hash = await submitEOACall(
      params.ctx,
      buildApprovalCall({ token: params.token, abi: params.abi }),
      params.description,
    )
    params.ctx.tracker.next()
    return hash
  } catch (error) {
    throw wrapMigrationError(error, params.step)
  }
}

const submitApprovals = async (
  ctx: MigrationCtx,
  plan: MigrationPlan,
): Promise<Hex[]> => {
  const hashes: Hex[] = []
  const baseRegistrarHash = await submitApprovalIfNeeded({
    ctx,
    needed: plan.preflight.needsBaseRegistrarApproval,
    token: V1_CONTRACTS.BaseRegistrar,
    abi: BASE_REGISTRAR_ABI,
    description: 'Approve .eth registrar for migration',
    step: 'Approve .eth registrar',
  })
  if (baseRegistrarHash) hashes.push(baseRegistrarHash)

  const nameWrapperHash = await submitApprovalIfNeeded({
    ctx,
    needed: plan.preflight.needsNameWrapperApproval,
    token: V1_CONTRACTS.NameWrapper,
    abi: NAME_WRAPPER_ABI,
    description: 'Approve NameWrapper for migration',
    step: 'Approve NameWrapper',
  })
  if (nameWrapperHash) hashes.push(nameWrapperHash)

  return hashes
}

export type OnBatchComplete = (names: readonly string[], txHash: Hex) => void

const submitHelperMigration = async (
  ctx: MigrationCtx,
  plan: MigrationPlan,
  onBatchComplete?: OnBatchComplete,
): Promise<Hex> => {
  const nameCount = plan.classified.length
  const description = `Migrate ${nameCount} name(s) with MigrationHelper`

  try {
    const hash = await submitEOACall(ctx, plan.helperCall, description)
    onBatchComplete?.(
      plan.classified.map((name) => name.domain.name),
      hash,
    )
    ctx.tracker.next()
    return hash
  } catch (error) {
    throw wrapMigrationError(error, 'MigrationHelper migration')
  }
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
    publicClient,
    signer,
    accountAddress,
    onProgress,
    onBatchComplete,
  } = params
  const { classified, ineligible, stepDescriptors } = plan

  if (classified.length === 0) {
    return {
      completed: 0,
      txHashes: [],
      ineligible: [...ineligible],
    }
  }

  const ctx: MigrationCtx = {
    publicClient,
    signer: requireEOASigner(signer, accountAddress),
    accountAddress,
    tracker: createTracker(onProgress, stepDescriptors.length),
  }

  const approvalHashes = await submitApprovals(ctx, plan)
  const migrationHash = await submitHelperMigration(ctx, plan, onBatchComplete)

  return {
    completed: classified.length,
    txHashes: [...approvalHashes, migrationHash],
    ineligible: [...ineligible],
  }
}
