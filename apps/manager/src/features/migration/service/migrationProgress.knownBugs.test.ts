import type { Signer } from '@ens-apps/transaction-manager'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { Config as WagmiConfig } from '@wagmi/core'
import { Storage } from 'happy-dom'
import { type Address, type Hex, namehash, type PublicClient } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createActor } from 'xstate'

const OWNER: Address = '0x0000000000000000000000000000000000000001'
const HCA: Address = '0x0000000000000000000000000000000000000002'
const RESOLVER: Address = '0x0000000000000000000000000000000000000004'
const OUTER_DATA: Hex = '0xcafe'

const mocks = vi.hoisted(() => ({
  verifyStandaloneHca: vi.fn(),
  startTransaction: vi.fn(),
  waitForTransactionHash: vi.fn(),
  waitForTransaction: vi.fn(),
  buildAtomicMigrationBatches: vi.fn(),
  checkMigrationApprovals: vi.fn(),
  planMigrationApprovals: vi.fn(),
  checkResolverReadiness: vi.fn(),
  assertNoLiveSubregistryOverwrite: vi.fn(),
  assertCopyMigrationReadiness: vi.fn(),
  verifyAtomicMigrationBatch: vi.fn(),
  publicClient: {
    chain: { id: 11155111 },
    getCode: vi.fn(),
    estimateGas: vi.fn(),
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
  },
}))

vi.mock('@ens-apps/smart-account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ens-apps/smart-account')>()),
  verifyStandaloneHca: mocks.verifyStandaloneHca,
}))
vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: { startTransaction: mocks.startTransaction },
  waitForTransactionHash: mocks.waitForTransactionHash,
  waitForTransaction: mocks.waitForTransaction,
}))
vi.mock('@/lib/wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/wagmi')>()),
  publicClient: mocks.publicClient,
}))
vi.mock('./buildAtomicMigrationBatches', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./buildAtomicMigrationBatches')>()),
  buildAtomicMigrationBatches: mocks.buildAtomicMigrationBatches,
}))
vi.mock('./migrationApprovals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./migrationApprovals')>()),
  checkMigrationApprovals: mocks.checkMigrationApprovals,
  planMigrationApprovals: mocks.planMigrationApprovals,
}))
vi.mock('./migrationInvariants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./migrationInvariants')>()),
  checkDeterministicMigrationResolverReadiness: mocks.checkResolverReadiness,
  assertNoLiveSubregistryOverwrite: mocks.assertNoLiveSubregistryOverwrite,
}))
vi.mock('./copyMigrationReadiness', () => ({
  assertCopyMigrationReadiness: mocks.assertCopyMigrationReadiness,
  assertCopySourcesFresh: vi.fn(),
}))
vi.mock('./verifyAtomicMigrationBatch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./verifyAtomicMigrationBatch')>()),
  verifyAtomicMigrationBatch: mocks.verifyAtomicMigrationBatch,
}))

import { migrationUiMachine } from '../state/migrationUi.machine'
import { makeDomain } from './_fixtures'
import type {
  AtomicMigrationBatch,
  BuildAtomicMigrationBatchesParams,
} from './buildAtomicMigrationBatches'
import { adjustPlanForRetry, type MigrationPlan } from './buildMigrationPlan'
import { buildStepDescriptors } from './buildStepDescriptors'
import {
  type ClassifiedName,
  classifyNames,
  groupClassifiedNames,
} from './classifyNames'
import {
  type MigrationApproval,
  type MigrationCleanupApproval,
  temporaryMigrationHcaApproval,
} from './migrationApprovals'
import { executeMigration, type MigrationProgress } from './migrationService'

const SIGNER = { type: 'eoa', walletClient: {} } as unknown as Signer
const HCA_CLIENT = {
  getAddress: vi.fn(() => HCA),
  getInitData: vi.fn(),
} as unknown as Pick<RhinestoneAccount, 'getAddress' | 'getInitData'>
const UNPLANNED_GRANT: MigrationApproval = {
  kind: 'operator',
  id: 'base-registrar:hca',
  contractAddress: RESOLVER,
  operatorAddress: HCA,
}

const hashFor = (value: number): Hex =>
  `0x${value.toString(16).padStart(64, '0')}` as Hex

const batchFor = (
  classified: readonly ClassifiedName[],
  estimatedGas = 500_000n,
): AtomicMigrationBatch => ({
  index: 0,
  names: classified.map(({ domain }) => domain.name),
  operations: classified.map(({ domain, action }) => ({
    name: domain.name,
    action,
  })),
  nameExecutions: [],
  innerExecutions: [],
  outerCall: { to: HCA, data: OUTER_DATA, value: 0n },
  walletCall: null,
  estimatedGas,
  walletEstimatedGas: 0n,
  verificationExpectations: [],
})

/** One planned atomic batch holding every label, as the preview sized it. */
const planFor = (
  labels: readonly string[],
  cleanupApprovals: readonly MigrationCleanupApproval[] = [],
): MigrationPlan => {
  const { classified } = classifyNames(
    labels.map((label) =>
      makeDomain({
        id: namehash(`${label}.eth`),
        name: `${label}.eth`,
        labelName: label,
      }),
    ),
    OWNER,
    11155111,
  )
  const atomicBatches = [batchFor(classified)]
  return {
    hcaAddress: HCA,
    hcaDeploymentRequired: false,
    migrationOwner: OWNER,
    classified,
    registryContext: classified,
    ineligible: [],
    groups: groupClassifiedNames(classified),
    preflight: {
      skipFetchProfilesPhase: true,
      migrationApprovals: [],
      migrationCleanupApprovals: cleanupApprovals,
    },
    ownedPermRes: RESOLVER,
    profiles: new Map(),
    directRoutes: new Map(),
    atomicBatches,
    stepDescriptors: buildStepDescriptors({
      hcaDeploymentRequired: false,
      approvals: [],
      cleanupApprovals,
      atomicBatches,
      registrationApprovalTargets: [],
    }),
  }
}

const runExecute = async (plan: MigrationPlan) => {
  const progressEvents: MigrationProgress[] = []
  await executeMigration({
    plan,
    wagmiConfig: {} as WagmiConfig,
    publicClient: mocks.publicClient as unknown as PublicClient,
    signer: SIGNER,
    hcaClient: HCA_CLIENT,
    refreshAccount: vi.fn(),
    onProgress: (progress) => progressEvents.push(progress),
  })
  return progressEvents
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', new Storage())

  let nextTransaction = 0
  mocks.startTransaction.mockImplementation(() => `tx-${nextTransaction++}`)
  const hashForTransaction = (txId: string) =>
    hashFor(Number.parseInt(txId.slice('tx-'.length), 10) + 1)
  mocks.waitForTransactionHash.mockImplementation(async (txId: string) =>
    hashForTransaction(txId),
  )
  mocks.waitForTransaction.mockImplementation(async (txId: string) => ({
    hash: hashForTransaction(txId),
  }))
  mocks.verifyStandaloneHca.mockResolvedValue(HCA)
  mocks.checkMigrationApprovals.mockResolvedValue({})
  mocks.planMigrationApprovals.mockReturnValue([])
  mocks.checkResolverReadiness.mockResolvedValue({
    status: 'verified',
    resolver: RESOLVER,
    implementation: RESOLVER,
    hcaHasRootRoles: true,
    walletHasWildcardRoles: true,
    writer: 'hca',
  })
  mocks.assertNoLiveSubregistryOverwrite.mockResolvedValue(undefined)
  mocks.assertCopyMigrationReadiness.mockResolvedValue(undefined)
  mocks.verifyAtomicMigrationBatch.mockResolvedValue({
    batchIndex: 0,
    status: 'confirmed',
    results: [],
  })
  // The live estimate fits only one name per batch, splitting the planned batch.
  mocks.buildAtomicMigrationBatches.mockImplementation(
    async ({
      classified,
      estimateBatchGas,
    }: BuildAtomicMigrationBatchesParams) => {
      const first = classified.slice(0, 1)
      const { outerGas } = await estimateBatchGas({
        call: { to: HCA, data: OUTER_DATA, value: 0n },
        names: first.map(({ domain }) => domain.name),
        innerExecutions: [],
        walletCall: null,
        walletExecutions: [],
      })
      return { resolver: RESOLVER, batches: [batchFor(first, outerGas)] }
    },
  )
  mocks.publicClient.getCode.mockResolvedValue('0x6000')
  mocks.publicClient.estimateGas.mockResolvedValue(500_000n)
  mocks.publicClient.readContract.mockImplementation(
    async ({ functionName }: { functionName: string }) =>
      functionName === 'ownerOf' ? OWNER : false,
  )
  mocks.publicClient.waitForTransactionReceipt.mockResolvedValue({
    status: 'success',
    blockNumber: 123n,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('migration progress known bugs (WEB-1942)', () => {
  // The tracker total comes from the preview, so a live batch split reports full progress after the first of its batches. Remove .fails when fixed.
  it.fails('WEB-1942 #10: reaches the progress total only once every split batch is confirmed', async () => {
    const events = await runExecute(planFor(['alice', 'bob']))

    const firstFull = events.findIndex(
      (event) => event.currentStep >= event.totalSteps,
    )
    const confirmedByThen = events
      .slice(0, firstFull + 1)
      .flatMap((event) => event.operations ?? [])
      .map(({ name }) => name)
    expect(confirmedByThen).toEqual(['alice.eth', 'bob.eth'])
  })

  // Same root cause: the second split batch opens its wallet prompt with the bar already full. Remove .fails when fixed.
  it.fails('WEB-1942 #10: keeps every open wallet prompt below the progress total when a live split adds a batch', async () => {
    const events = await runExecute(planFor(['alice', 'bob']))

    const fullWhilePrompting = events.filter(
      (event) =>
        event.isAwaitingConfirmation && event.currentStep >= event.totalSteps,
    )
    expect(fullWhilePrompting).toEqual([])
  })

  // With every name done, adjustPlanForRetry returns no descriptors even though cleanup is still planned. Remove .fails when fixed.
  it.fails('WEB-1942 #10: keeps the planned cleanup step when a retry has no names left', () => {
    const plan = planFor(['alice'], [temporaryMigrationHcaApproval(HCA)])

    expect(adjustPlanForRetry(plan, ['alice.eth']).stepDescriptors).toEqual([
      { type: 'cleanup', approvalId: 'eth-registry:hca' },
    ])
  })

  // A plan-changed failure from a cleanup mismatch or an unplanned grant fails identically on retry, yet failure still accepts retry. Remove .fails when fixed.
  it.fails.each([
    {
      cause: 'a cleanup mismatch',
      arrange: () =>
        mocks.checkMigrationApprovals.mockResolvedValue({
          ethRegistryHcaApproved: true,
        }),
    },
    {
      cause: 'a new unplanned grant',
      arrange: () =>
        mocks.planMigrationApprovals.mockReturnValue([UNPLANNED_GRANT]),
    },
  ])(
    'WEB-1942 #11: does not offer retry after plan-changed caused by $cause',
    async ({ arrange }) => {
      vi.useFakeTimers()
      arrange()
      const actor = createActor(migrationUiMachine, {
        input: { wagmiConfig: {} as WagmiConfig },
      })
      actor.start()
      actor.send({
        type: 'migration.start',
        plan: planFor(['alice']),
        signer: SIGNER,
        hcaClient: HCA_CLIENT,
        refreshAccount: vi.fn(),
      })
      await vi.advanceTimersByTimeAsync(1500)

      const snapshot = actor.getSnapshot()
      expect(snapshot.value).toBe('failure')
      expect(snapshot.context.lastError).toEqual({ type: 'plan-changed' })
      expect(snapshot.can({ type: 'retry' })).toBe(false)
      actor.stop()
    },
  )
})
