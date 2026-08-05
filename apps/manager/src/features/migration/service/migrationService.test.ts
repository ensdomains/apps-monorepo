import type { Signer } from '@ens-apps/transaction-manager'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { Config as WagmiConfig } from '@wagmi/core'
import type { Address, Hex, PublicClient, TransactionReceipt } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  buildHcaDeploymentCall: vi.fn(),
  verifyStandaloneHca: vi.fn(),
  startTransaction: vi.fn(),
  waitForTransaction: vi.fn(),
  buildAtomicMigrationBatches: vi.fn(),
  checkMigrationApprovals: vi.fn(),
  planMigrationApprovals: vi.fn(),
  buildMigrationApprovalCall: vi.fn(),
  trackCreatedMigrationApproval: vi.fn(),
  checkResolverReadiness: vi.fn(),
  reconcileAtomicMigrationBatch: vi.fn(),
  verifyAtomicMigrationBatch: vi.fn(),
}))

vi.mock('@ens-apps/smart-account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ens-apps/smart-account')>()),
  buildHcaDeploymentCall: mocks.buildHcaDeploymentCall,
  verifyStandaloneHca: mocks.verifyStandaloneHca,
}))

vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: { startTransaction: mocks.startTransaction },
  waitForTransaction: mocks.waitForTransaction,
}))

vi.mock('./buildAtomicMigrationBatches', () => ({
  buildAtomicMigrationBatches: mocks.buildAtomicMigrationBatches,
}))

vi.mock('./migrationApprovals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./migrationApprovals')>()),
  checkMigrationApprovals: mocks.checkMigrationApprovals,
  planMigrationApprovals: mocks.planMigrationApprovals,
  buildMigrationApprovalCall: mocks.buildMigrationApprovalCall,
  trackCreatedMigrationApproval: mocks.trackCreatedMigrationApproval,
}))

vi.mock('./migrationInvariants', () => ({
  checkDeterministicMigrationResolverReadiness: mocks.checkResolverReadiness,
}))

vi.mock('./verifyAtomicMigrationBatch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./verifyAtomicMigrationBatch')>()),
  reconcileAtomicMigrationBatch: mocks.reconcileAtomicMigrationBatch,
  verifyAtomicMigrationBatch: mocks.verifyAtomicMigrationBatch,
}))

import type { MigrationPlan } from './buildMigrationPlan'
import type { ClassifiedName } from './classifyNames'
import {
  migrationApprovalLedgerStorageKey,
  persistMigrationApprovalLedger,
} from './migrationApprovalLedger'
import type { MigrationApproval } from './migrationApprovals'
import {
  executeMigration,
  executeMigrationCleanup,
  type MigrationProgress,
} from './migrationService'
import type { V1Domain } from './v1SubgraphClient'
import {
  AtomicMigrationBatchReconciliationIndeterminateError,
  AtomicMigrationBatchVerificationError,
} from './verifyAtomicMigrationBatch'

const OWNER: Address = '0x0000000000000000000000000000000000000001'
const HCA: Address = '0x0000000000000000000000000000000000000002'
const FACTORY: Address = '0x0000000000000000000000000000000000000003'
const RESOLVER: Address = '0x0000000000000000000000000000000000000004'
const V1_RESOLVER: Address = '0x0000000000000000000000000000000000000005'
const APPROVAL_CONTRACT: Address = '0x0000000000000000000000000000000000000006'
const HELPER: Address = '0x0000000000000000000000000000000000000007'

const DEPLOY_DATA: Hex = '0xd3ad'
const OUTER_DATA: Hex = '0xcafe'
const GRANT_DATA: Hex = '0x01'
const REVOKE_DATA: Hex = '0x00'

const WAGMI = {} as WagmiConfig
const SIGNER = {
  type: 'eoa',
  walletClient: {},
} as unknown as Signer
const HCA_CLIENT = {
  getAddress: vi.fn(() => HCA),
  getInitData: vi.fn(),
} as unknown as Pick<RhinestoneAccount, 'getAddress' | 'getInitData'>

const getCodeMock = vi.fn()
const estimateGasMock = vi.fn()
const readContractMock = vi.fn()
const waitForReceiptMock = vi.fn()
const PUBLIC_CLIENT = {
  chain: { id: 11155111 },
  getCode: getCodeMock,
  estimateGas: estimateGasMock,
  readContract: readContractMock,
  waitForTransactionReceipt: waitForReceiptMock,
} as unknown as PublicClient

const APPROVAL: MigrationApproval = {
  id: 'base-registrar:migration-helper',
  contractAddress: APPROVAL_CONTRACT,
  operatorAddress: HELPER,
}
const SECOND_APPROVAL: MigrationApproval = {
  id: 'base-registrar:hca',
  contractAddress: APPROVAL_CONTRACT,
  operatorAddress: HCA,
}

const hashFor = (value: number): Hex =>
  `0x${value.toString(16).padStart(64, '0')}` as Hex

const domainFor = (label: string): V1Domain =>
  ({
    id: label,
    name: `${label}.eth`,
    labelName: label,
    labelhash:
      '0x0000000000000000000000000000000000000000000000000000000000000002',
    resolver: { address: V1_RESOLVER },
    owner: { id: OWNER },
    registrant: { id: OWNER },
    wrappedOwner: null,
    parent: { name: 'eth', wrappedDomain: null },
    registration: null,
    wrappedDomain: null,
  }) as V1Domain

const classifiedFor = (label: string): ClassifiedName => ({
  domain: domainFor(label),
  tokenType: 'unwrapped',
  label,
  parentName: 'eth',
  fuses: 0n,
  tokenHolder: OWNER,
  v1ResolverAddress: V1_RESOLVER,
  resolverStrategy: 'to-owned-permres',
  managerAddress: null,
})

const planFor = (labels: readonly string[] = ['alice']): MigrationPlan => {
  const classified = labels.map(classifiedFor)
  const nameExecutions = classified.map((classifiedName) => {
    const name = classifiedName.domain.name
    return {
      classified: classifiedName,
      innerExecutions: [],
      verificationExpectations: [
        {
          id: `${name}:name-owner`,
          type: 'name-owner' as const,
          name,
          label: classifiedName.label,
          node: classifiedName.domain.id as Hex,
          resource: 1n,
          tokenType: classifiedName.tokenType,
          registryPath: {
            type: 'eth-registry-2ld' as const,
            registry: RESOLVER,
            label: classifiedName.label,
            resource: 1n,
          },
          expectedOwner: OWNER,
        },
      ],
    }
  })
  return {
    hcaAddress: HCA,
    hcaDeploymentRequired: false,
    migrationOwner: OWNER,
    domains: classified.map(({ domain }) => domain),
    classified,
    ineligible: [],
    groups: {
      unwrapped: classified,
      unlocked: [],
      locked2ld: [],
      childNames: new Map(),
    },
    preflight: {
      preExistingOwnedPermRes: null,
      skipApprovalPhase: false,
      skipFetchProfilesPhase: true,
      baseRegistrarApproved: false,
      nameWrapperApproved: false,
    },
    ownedPermRes: RESOLVER,
    profiles: new Map(),
    atomicBatches:
      nameExecutions.length === 0
        ? []
        : [
            {
              index: 0,
              names: nameExecutions.map(
                ({ classified: name }) => name.domain.name,
              ),
              nameExecutions,
              innerExecutions: [],
              outerCall: { to: HCA, data: OUTER_DATA, value: 0n },
              estimatedGas: 500_000n,
              verificationExpectations: nameExecutions.flatMap(
                (execution) => execution.verificationExpectations,
              ),
            },
          ],
    stepDescriptors: [],
  }
}

const runExecute = async (
  overrides: {
    plan?: MigrationPlan
    refreshAccount?: () => Promise<void>
    onBatchComplete?: (names: readonly string[], hash?: Hex) => void
    onApprovalCreated?: (approval: MigrationApproval) => void
    onApprovalRemoved?: (approval: MigrationApproval) => void
    reconcileBeforeSubmit?: boolean
  } = {},
) => {
  const progressEvents: MigrationProgress[] = []
  const refreshAccount = overrides.refreshAccount ?? vi.fn()
  const result = await executeMigration({
    plan: overrides.plan ?? planFor(),
    wagmiConfig: WAGMI,
    publicClient: PUBLIC_CLIENT,
    signer: SIGNER,
    hcaClient: HCA_CLIENT,
    refreshAccount,
    onProgress: (progress) => progressEvents.push(progress),
    onBatchComplete: overrides.onBatchComplete,
    onApprovalCreated: overrides.onApprovalCreated,
    onApprovalRemoved: overrides.onApprovalRemoved,
    reconcileBeforeSubmit: overrides.reconcileBeforeSubmit,
  })
  return { progressEvents, refreshAccount, result }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()

  let nextTransaction = 0
  mocks.startTransaction.mockImplementation(() => `tx-${nextTransaction++}`)
  let nextHash = 1
  mocks.waitForTransaction.mockImplementation(() =>
    Promise.resolve({ hash: hashFor(nextHash++) }),
  )

  mocks.buildHcaDeploymentCall.mockReturnValue({
    to: FACTORY,
    data: DEPLOY_DATA,
    value: 0n,
  })
  mocks.verifyStandaloneHca.mockResolvedValue(HCA)
  mocks.checkMigrationApprovals.mockResolvedValue({})
  mocks.planMigrationApprovals.mockReturnValue([])
  mocks.buildMigrationApprovalCall.mockImplementation(
    (approval: MigrationApproval, approved: boolean) => ({
      to: approval.contractAddress,
      data: approved ? GRANT_DATA : REVOKE_DATA,
      value: 0n,
    }),
  )
  mocks.trackCreatedMigrationApproval.mockImplementation(
    (created: readonly MigrationApproval[], approval: MigrationApproval) =>
      created.some((candidate) => candidate.id === approval.id)
        ? created
        : [...created, approval],
  )
  mocks.checkResolverReadiness.mockResolvedValue({
    status: 'verified',
    resolver: RESOLVER,
    implementation: RESOLVER,
    hcaHasRootRoles: true,
    walletHasWildcardRoles: true,
  })
  mocks.buildAtomicMigrationBatches.mockImplementation(
    ({ hca, classified }: { hca: Address; classified: ClassifiedName[] }) =>
      Promise.resolve({
        resolver: RESOLVER,
        batches: [
          {
            index: 0,
            names: classified.map(({ domain }) => domain.name),
            nameExecutions: [],
            innerExecutions: [],
            outerCall: { to: hca, data: OUTER_DATA, value: 0n },
            estimatedGas: 500_000n,
            verificationExpectations: [],
          },
        ],
      }),
  )
  mocks.reconcileAtomicMigrationBatch.mockResolvedValue({
    status: 'complete',
    verification: { batchIndex: 0, status: 'confirmed', results: [] },
  })
  mocks.verifyAtomicMigrationBatch.mockResolvedValue({
    batchIndex: 0,
    status: 'confirmed',
    results: [],
  })

  getCodeMock.mockResolvedValue('0x6000')
  estimateGasMock.mockResolvedValue(500_000n)
  readContractMock.mockResolvedValue(true)
  waitForReceiptMock.mockResolvedValue({
    status: 'success',
    blockNumber: 123n,
  } as TransactionReceipt)
})

describe('executeMigration HCA orchestration', () => {
  it('returns an empty cleanup result for an empty ledger', async () => {
    await expect(
      executeMigrationCleanup({
        approvals: [],
        wagmiConfig: WAGMI,
        publicClient: PUBLIC_CLIENT,
        signer: SIGNER,
        walletAddress: OWNER,
        hcaAddress: HCA,
      }),
    ).resolves.toEqual({ txHashes: [], pending: [] })
  })

  it('deploys an undeployed HCA directly from the wallet and refreshes account state', async () => {
    getCodeMock.mockResolvedValueOnce('0x')
    const refreshAccount = vi.fn(() => Promise.resolve())

    const { result } = await runExecute({ refreshAccount })

    expect(mocks.buildHcaDeploymentCall).toHaveBeenCalledWith({
      client: HCA_CLIENT,
      chainId: 11155111,
      expectedHca: HCA,
      expectedOwner: OWNER,
    })
    expect(mocks.startTransaction.mock.calls[0]?.[0]).toMatchObject({
      type: 'custom',
      request: {
        type: 'eoa',
        from: OWNER,
        to: FACTORY,
        data: DEPLOY_DATA,
        value: 0n,
        chainId: 11155111,
      },
    })
    expect(mocks.verifyStandaloneHca).toHaveBeenCalledWith(
      expect.objectContaining({
        publicClient: PUBLIC_CLIENT,
        hca: HCA,
        expectedOwner: OWNER,
      }),
    )
    expect(refreshAccount).toHaveBeenCalledOnce()
    expect(result.completed).toBe(1)
    expect(result.txHashes).toEqual([hashFor(1), hashFor(2)])
  })

  it('rejects mismatched HCA deployment data before opening a wallet transaction', async () => {
    getCodeMock.mockResolvedValueOnce('0x')
    mocks.buildHcaDeploymentCall.mockImplementationOnce(() => {
      throw new Error('HCA deployment clientHca mismatch')
    })

    await expect(runExecute()).rejects.toSatisfy(
      (error) => error instanceof Error && error.name === 'MigrationError',
    )

    expect(mocks.startTransaction).not.toHaveBeenCalled()
    expect(mocks.verifyStandaloneHca).not.toHaveBeenCalled()
  })

  it('consumes a planned deployment step when a retry finds the HCA already deployed', async () => {
    const plan = {
      ...planFor(),
      hcaDeploymentRequired: true,
      stepDescriptors: [
        { type: 'deploy-hca' as const },
        { type: 'atomic-batch' as const, index: 0, total: 1, count: 1 },
      ],
    }

    const { progressEvents } = await runExecute({ plan })

    expect(mocks.buildHcaDeploymentCall).not.toHaveBeenCalled()
    expect(progressEvents).toContainEqual(
      expect.objectContaining({
        currentStep: 1,
        totalSteps: 2,
        description: 'HCA already ready',
      }),
    )
    expect(progressEvents.at(-1)).toMatchObject({
      currentStep: 2,
      totalSteps: 2,
      description: 'Atomic batch verified',
    })
  })

  it('submits executeByOwner as a wallet-paid EOA transaction targeting the HCA', async () => {
    await runExecute()

    expect(mocks.startTransaction).toHaveBeenCalledOnce()
    expect(mocks.startTransaction).toHaveBeenCalledWith(
      {
        type: 'custom',
        request: {
          type: 'eoa',
          from: OWNER,
          to: HCA,
          data: OUTER_DATA,
          value: 0n,
          chainId: 11155111,
        },
      },
      SIGNER,
      expect.objectContaining({ publicClient: PUBLIC_CLIENT }),
    )
  })

  it('persists a potentially submitted approval before waiting for its receipt', async () => {
    mocks.planMigrationApprovals.mockReturnValue([APPROVAL])
    waitForReceiptMock.mockResolvedValueOnce({
      status: 'reverted',
      blockNumber: 123n,
    } as TransactionReceipt)
    const onApprovalCreated = vi.fn()

    await expect(runExecute({ onApprovalCreated })).rejects.toSatisfy(
      (error) => error instanceof Error && error.name === 'MigrationError',
    )

    expect(mocks.buildMigrationApprovalCall).toHaveBeenCalledWith(
      APPROVAL,
      true,
    )
    expect(mocks.trackCreatedMigrationApproval).toHaveBeenCalledWith(
      [],
      APPROVAL,
    )
    expect(onApprovalCreated).toHaveBeenCalledWith(APPROVAL)
    expect(localStorage.getItem(migrationApprovalLedgerStorageKey)).toContain(
      APPROVAL.id,
    )
    expect(mocks.buildAtomicMigrationBatches).not.toHaveBeenCalled()
  })

  it('keeps aggregate cleanup progress within the planned step count', async () => {
    mocks.planMigrationApprovals.mockReturnValue([APPROVAL, SECOND_APPROVAL])
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [APPROVAL, SECOND_APPROVAL],
      },
      stepDescriptors: [
        { type: 'approval' as const, approvalId: APPROVAL.id },
        { type: 'approval' as const, approvalId: SECOND_APPROVAL.id },
        { type: 'atomic-batch' as const, index: 0, total: 1, count: 1 },
        { type: 'cleanup' as const, count: 2 },
      ],
    }

    const { progressEvents, result } = await runExecute({ plan })

    expect(result.cleanupPending).toEqual([])
    expect(
      Math.max(...progressEvents.map(({ currentStep }) => currentStep)),
    ).toBe(4)
    expect(progressEvents.at(-1)).toMatchObject({
      currentStep: 4,
      totalSteps: 4,
      description: 'Temporary permissions removed',
    })
  })

  it('advances planned approval and cleanup steps when live state already satisfies them', async () => {
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [APPROVAL],
      },
      stepDescriptors: [
        { type: 'approval' as const, approvalId: APPROVAL.id },
        { type: 'atomic-batch' as const, index: 0, total: 1, count: 1 },
        { type: 'cleanup' as const, count: 1 },
      ],
    }

    const { progressEvents } = await runExecute({ plan })

    expect(mocks.buildMigrationApprovalCall).not.toHaveBeenCalled()
    expect(progressEvents).toContainEqual(
      expect.objectContaining({
        currentStep: 1,
        totalSteps: 3,
        description: 'Permission already confirmed',
      }),
    )
    expect(progressEvents.at(-1)).toMatchObject({
      currentStep: 3,
      totalSteps: 3,
      description: 'Temporary permissions removed',
    })
  })

  it('clears a persisted approval without a transaction when it is already inactive', async () => {
    persistMigrationApprovalLedger(
      { chainId: 11155111, owner: OWNER, hca: HCA },
      [APPROVAL],
    )
    readContractMock.mockResolvedValueOnce(false)
    const onApprovalRemoved = vi.fn()

    const result = await executeMigrationCleanup({
      approvals: [APPROVAL],
      wagmiConfig: WAGMI,
      publicClient: PUBLIC_CLIENT,
      signer: SIGNER,
      walletAddress: OWNER,
      hcaAddress: HCA,
      onApprovalRemoved,
    })

    expect(result).toEqual({ txHashes: [], pending: [] })
    expect(readContractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        address: APPROVAL_CONTRACT,
        functionName: 'isApprovedForAll',
        args: [OWNER, HELPER],
      }),
    )
    expect(mocks.startTransaction).not.toHaveBeenCalled()
    expect(onApprovalRemoved).toHaveBeenCalledWith(APPROVAL)
    expect(localStorage.getItem(migrationApprovalLedgerStorageKey)).toBeNull()
  })

  it('keeps a persisted approval retryable when its cleanup read is indeterminate', async () => {
    persistMigrationApprovalLedger(
      { chainId: 11155111, owner: OWNER, hca: HCA },
      [APPROVAL],
    )
    const readFailure = new Error('RPC unavailable')
    readContractMock.mockRejectedValueOnce(readFailure)

    const result = await executeMigrationCleanup({
      approvals: [APPROVAL],
      wagmiConfig: WAGMI,
      publicClient: PUBLIC_CLIENT,
      signer: SIGNER,
      walletAddress: OWNER,
      hcaAddress: HCA,
    })

    expect(result).toMatchObject({
      txHashes: [],
      pending: [APPROVAL],
      error: readFailure,
    })
    expect(mocks.startTransaction).not.toHaveBeenCalled()
    expect(localStorage.getItem(migrationApprovalLedgerStorageKey)).toContain(
      APPROVAL.id,
    )
  })

  it('does not emit batchComplete until all post-state verification succeeds', async () => {
    mocks.verifyAtomicMigrationBatch.mockRejectedValueOnce(
      new Error('owner mismatch'),
    )
    const onBatchComplete = vi.fn()

    await expect(runExecute({ onBatchComplete })).rejects.toSatisfy(
      (error) => error instanceof Error && error.name === 'MigrationError',
    )

    expect(mocks.verifyAtomicMigrationBatch).toHaveBeenCalledWith({
      publicClient: PUBLIC_CLIENT,
      batch: expect.objectContaining({ names: ['alice.eth'] }),
      blockNumber: 123n,
    })
    expect(onBatchComplete).not.toHaveBeenCalled()
  })

  it('reconciles an already-complete batch on retry without resubmitting it', async () => {
    const onBatchComplete = vi.fn()

    const { result } = await runExecute({
      onBatchComplete,
      reconcileBeforeSubmit: true,
    })

    expect(mocks.reconcileAtomicMigrationBatch).toHaveBeenCalledWith({
      publicClient: PUBLIC_CLIENT,
      batch: {
        index: 0,
        verificationExpectations: [
          expect.objectContaining({ id: 'alice.eth:name-owner' }),
        ],
      },
    })
    expect(mocks.buildAtomicMigrationBatches).not.toHaveBeenCalled()
    expect(estimateGasMock).not.toHaveBeenCalled()
    expect(mocks.startTransaction).not.toHaveBeenCalled()
    expect(onBatchComplete).toHaveBeenCalledWith(['alice.eth'])
    expect(result.completed).toBe(1)
    expect(result.txHashes).toEqual([])
  })

  it('finishes progress at the planned total when retry reconciliation skips setup and submission', async () => {
    const plan = {
      ...planFor(),
      hcaDeploymentRequired: true,
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [APPROVAL],
      },
      stepDescriptors: [
        { type: 'deploy-hca' as const },
        { type: 'approval' as const, approvalId: APPROVAL.id },
        { type: 'atomic-batch' as const, index: 0, total: 1, count: 1 },
        { type: 'cleanup' as const, count: 1 },
      ],
    }

    const { progressEvents } = await runExecute({
      plan,
      reconcileBeforeSubmit: true,
    })

    expect(mocks.startTransaction).not.toHaveBeenCalled()
    expect(progressEvents.at(-1)).toMatchObject({
      currentStep: 4,
      totalSteps: 4,
      description: 'Migration complete',
    })
    expect(progressEvents.every(({ currentStep }) => currentStep <= 4)).toBe(
      true,
    )
  })

  it('reconciles every name before rebuilding only deterministic mismatches', async () => {
    mocks.reconcileAtomicMigrationBatch
      .mockResolvedValueOnce({
        status: 'complete',
        verification: { batchIndex: 0, status: 'confirmed', results: [] },
      })
      .mockResolvedValueOnce({
        status: 'incomplete',
        verification: {
          batchIndex: 0,
          status: 'confirmed',
          results: [{ expectationId: 'bob.eth:name-owner', satisfied: false }],
        },
        mismatches: [{ expectationId: 'bob.eth:name-owner' }],
      })
    const onBatchComplete = vi.fn()

    await runExecute({
      plan: planFor(['alice', 'bob']),
      onBatchComplete,
      reconcileBeforeSubmit: true,
    })

    expect(mocks.reconcileAtomicMigrationBatch).toHaveBeenCalledTimes(2)
    expect(
      mocks.reconcileAtomicMigrationBatch.mock.invocationCallOrder[1],
    ).toBeLessThan(
      mocks.buildAtomicMigrationBatches.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    )
    expect(mocks.buildAtomicMigrationBatches).toHaveBeenCalledWith(
      expect.objectContaining({
        classified: [expect.objectContaining({ label: 'bob' })],
      }),
    )
    expect(onBatchComplete).toHaveBeenNthCalledWith(1, ['alice.eth'])
    expect(onBatchComplete).toHaveBeenNthCalledWith(2, ['bob.eth'], hashFor(1))
  })

  it('does not rebuild or submit when retry reconciliation has an indeterminate read', async () => {
    const readFailure = new Error('RPC unavailable')
    mocks.reconcileAtomicMigrationBatch.mockRejectedValueOnce(
      new AtomicMigrationBatchReconciliationIndeterminateError({
        message: 'post-state read failed',
        batchIndex: 0,
        readFailures: [
          { expectationId: 'alice.eth:name-owner', cause: readFailure },
        ],
        cause: readFailure,
      }),
    )

    const error = await runExecute({
      reconcileBeforeSubmit: true,
    }).catch((cause: unknown) => cause)

    expect(error).toMatchObject({
      name: 'MigrationError',
      step: 'Reconciling previous atomic migration',
    })
    expect(mocks.buildAtomicMigrationBatches).not.toHaveBeenCalled()
    expect(estimateGasMock).not.toHaveBeenCalled()
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })

  it('treats deterministic verification mismatches as safe to rebuild', async () => {
    const mismatch = new AtomicMigrationBatchVerificationError({
      message: 'owner mismatch',
      batchIndex: 0,
      verification: {
        batchIndex: 0,
        status: 'confirmed',
        results: [{ expectationId: 'alice.eth:name-owner', satisfied: false }],
      },
      failures: [{ expectationId: 'alice.eth:name-owner' }],
    })
    mocks.reconcileAtomicMigrationBatch.mockResolvedValueOnce({
      status: 'incomplete',
      verification: mismatch.verification,
      mismatches: mismatch.failures,
    })

    await runExecute({ reconcileBeforeSubmit: true })

    expect(mocks.buildAtomicMigrationBatches).toHaveBeenCalledOnce()
    expect(mocks.startTransaction).toHaveBeenCalledOnce()
  })

  it('fails closed when the retry plan has no stored expectations for a name', async () => {
    const plan = { ...planFor(), atomicBatches: [] }

    const error = await runExecute({
      plan,
      reconcileBeforeSubmit: true,
    }).catch((cause: unknown) => cause)

    expect(error).toMatchObject({
      name: 'MigrationError',
      step: 'Reconciling previous atomic migration',
    })
    expect(mocks.reconcileAtomicMigrationBatch).not.toHaveBeenCalled()
    expect(mocks.buildAtomicMigrationBatches).not.toHaveBeenCalled()
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })

  it('keeps migration successful and returns cleanupPending when revocation fails', async () => {
    mocks.planMigrationApprovals.mockReturnValue([APPROVAL])
    waitForReceiptMock
      .mockResolvedValueOnce({
        status: 'success',
        blockNumber: 121n,
      } as TransactionReceipt)
      .mockResolvedValueOnce({
        status: 'success',
        blockNumber: 122n,
      } as TransactionReceipt)
      .mockResolvedValueOnce({
        status: 'reverted',
        blockNumber: 123n,
      } as TransactionReceipt)
    const onApprovalCreated = vi.fn()
    const onApprovalRemoved = vi.fn()

    const { result } = await runExecute({
      onApprovalCreated,
      onApprovalRemoved,
    })

    expect(onApprovalCreated).toHaveBeenCalledWith(APPROVAL)
    expect(onApprovalRemoved).not.toHaveBeenCalled()
    expect(mocks.buildMigrationApprovalCall).toHaveBeenNthCalledWith(
      1,
      APPROVAL,
      true,
    )
    expect(mocks.buildMigrationApprovalCall).toHaveBeenNthCalledWith(
      2,
      APPROVAL,
      false,
    )
    expect(result.completed).toBe(1)
    expect(result.cleanupPending).toEqual([APPROVAL])
    expect(result.txHashes).toEqual([hashFor(1), hashFor(2)])
  })

  it('returns immediately when no eligible names remain', async () => {
    const result = await executeMigration({
      plan: planFor([]),
      wagmiConfig: WAGMI,
      publicClient: PUBLIC_CLIENT,
      signer: SIGNER,
      hcaClient: HCA_CLIENT,
      refreshAccount: vi.fn(),
      onProgress: vi.fn(),
    })

    expect(result).toEqual({
      completed: 0,
      txHashes: [],
      ineligible: [],
      cleanupPending: [],
    })
    expect(getCodeMock).not.toHaveBeenCalled()
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })
})
