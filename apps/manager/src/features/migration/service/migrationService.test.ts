import type { Signer } from '@ens-apps/transaction-manager'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { Config as WagmiConfig } from '@wagmi/core'
import {
  type Address,
  encodeErrorResult,
  type Hex,
  type PublicClient,
  parseAbi,
  type TransactionReceipt,
} from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  buildHcaDeploymentCall: vi.fn(),
  verifyStandaloneHca: vi.fn(),
  startTransaction: vi.fn(),
  waitForTransactionHash: vi.fn(),
  waitForTransaction: vi.fn(),
  buildAtomicMigrationBatches: vi.fn(),
  checkMigrationApprovals: vi.fn(),
  planMigrationApprovals: vi.fn(),
  buildMigrationApprovalCall: vi.fn(),
  checkResolverReadiness: vi.fn(),
  assertCopyMigrationReadiness: vi.fn(),
  assertCopySourcesFresh: vi.fn(),
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
  waitForTransactionHash: mocks.waitForTransactionHash,
  waitForTransaction: mocks.waitForTransaction,
}))

vi.mock('./buildAtomicMigrationBatches', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./buildAtomicMigrationBatches')>()),
  buildAtomicMigrationBatches: mocks.buildAtomicMigrationBatches,
}))

vi.mock('./migrationApprovals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./migrationApprovals')>()),
  checkMigrationApprovals: mocks.checkMigrationApprovals,
  planMigrationApprovals: mocks.planMigrationApprovals,
  buildMigrationApprovalCall: mocks.buildMigrationApprovalCall,
}))

vi.mock('./migrationInvariants', () => ({
  checkDeterministicMigrationResolverReadiness: mocks.checkResolverReadiness,
}))

vi.mock('./copyMigrationReadiness', () => ({
  assertCopyMigrationReadiness: mocks.assertCopyMigrationReadiness,
  assertCopySourcesFresh: mocks.assertCopySourcesFresh,
}))

vi.mock('./verifyAtomicMigrationBatch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./verifyAtomicMigrationBatch')>()),
  reconcileAtomicMigrationBatch: mocks.reconcileAtomicMigrationBatch,
  verifyAtomicMigrationBatch: mocks.verifyAtomicMigrationBatch,
}))

import { V2_CONTRACTS } from '../contracts/addresses'
import type {
  AtomicMigrationNameExecution,
  BuildAtomicMigrationBatchesParams,
} from './buildAtomicMigrationBatches'
import type { MigrationPlan } from './buildMigrationPlan'
import type { ClassifiedName, CopyClassifiedName } from './classifyNames'
import { groupClassifiedNames } from './classifyNames'
import {
  loadMigrationApprovalCleanupJournal,
  loadMigrationApprovalCleanupObligation,
  recordMigrationApprovalCleanupGrantAttempt,
  recordMigrationApprovalCleanupGrantHash,
  recordMigrationApprovalCleanupRequired,
  recordMigrationApprovalCleanupRevocationHash,
} from './migrationApprovalCleanupJournal'
import type {
  MigrationApproval,
  MigrationCleanupApproval,
} from './migrationApprovals'
import {
  loadMigrationRecoverySnapshot,
  loadPendingAtomicMigrationIntents,
  loadSubmittedAtomicMigrationBatches,
  persistPendingAtomicMigrationIntent,
  persistSubmittedAtomicMigrationBatch,
} from './migrationBatchJournal'
import {
  executeMigration,
  type MigrationProgress,
  type OnBatchComplete,
  revokeStandingTemporaryHcaAccess,
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
const CLEANUP_SCOPE = {
  chainId: 11155111,
  owner: OWNER,
  hca: HCA,
} as const

const DEPLOY_DATA: Hex = '0xd3ad'
const OUTER_DATA: Hex = '0xcafe'
const GRANT_DATA: Hex = '0x01'
const DIRECT_PERMISSION_ERROR_ABI = parseAbi([
  'error ERC721InsufficientApproval(address operator, uint256 tokenId)',
])

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
/** Simulated ETHRegistry.isApprovedForAll(owner, hca) chain state. */
let ethRegistryOperatorGranted = false
const getTransactionReceiptMock = vi.fn()
const getTransactionMock = vi.fn()
const waitForReceiptMock = vi.fn()
const PUBLIC_CLIENT = {
  chain: { id: 11155111 },
  getCode: getCodeMock,
  estimateGas: estimateGasMock,
  readContract: readContractMock,
  getTransaction: getTransactionMock,
  getTransactionReceipt: getTransactionReceiptMock,
  waitForTransactionReceipt: waitForReceiptMock,
} as unknown as PublicClient

const APPROVAL: MigrationApproval = {
  kind: 'operator',
  id: 'base-registrar:hca',
  contractAddress: APPROVAL_CONTRACT,
  operatorAddress: HCA,
}
const MANAGER_APPROVAL: MigrationCleanupApproval = {
  kind: 'operator',
  id: 'eth-registry:hca',
  contractAddress: APPROVAL_CONTRACT,
  operatorAddress: HCA,
}

// setApprovalForAll(operator, false): selector plus an all-zero final word.
const REVOKE_SELECTOR = '0xa22cb465'
const revocationCalls = () =>
  mocks.startTransaction.mock.calls.filter((call) => {
    const data = (call?.[0] as { request?: { data?: string } })?.request?.data
    return (
      typeof data === 'string' &&
      data.startsWith(REVOKE_SELECTOR) &&
      data.slice(-64) === '0'.repeat(64)
    )
  })

const hashFor = (value: number): Hex =>
  `0x${value.toString(16).padStart(64, '0')}` as Hex

const permissionMissingError = (): Error & { readonly data: Hex } =>
  Object.assign(new Error('ERC-721 approval is not visible yet'), {
    data: encodeErrorResult({
      abi: DIRECT_PERMISSION_ERROR_ABI,
      errorName: 'ERC721InsufficientApproval',
      args: [HCA, 2n],
    }),
  })

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
  action: 'migrate',
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

const copyClassifiedFor = (params?: {
  readonly label?: string
  readonly parentName?: string
}): CopyClassifiedName => {
  const label = params?.label ?? 'sub'
  const parentName = params?.parentName ?? 'alice.eth'
  const domain = {
    ...domainFor(label),
    id: hashFor(20),
    name: `${label}.${parentName}`,
    labelName: label,
    parent: { name: parentName, wrappedDomain: null },
  } as V1Domain
  return {
    action: 'copy',
    domain,
    tokenType: 'registry-child',
    copySource: 'registry',
    sourceExpiry: (1n << 64n) - 1n,
    label,
    parentName,
    fuses: 0n,
    tokenHolder: OWNER,
    v1ResolverAddress: V1_RESOLVER,
    resolverStrategy: 'to-owned-permres',
    managerAddress: null,
  }
}

const planFromClassified = (
  classified: readonly ClassifiedName[],
  registryContext: readonly ClassifiedName[] = classified,
): MigrationPlan => {
  const nameExecutions: AtomicMigrationNameExecution[] = classified.map(
    (classifiedName) => {
      const name = classifiedName.domain.name
      const directRoute =
        classifiedName.action === 'migrate'
          ? {
              name,
              receiver: RESOLVER,
              parentDependency: null,
              expectedWrapperRegistry: null,
              receiverReadiness: 'migration-controller' as const,
            }
          : null
      return {
        classified: classifiedName,
        directRoute,
        migrationData:
          classifiedName.action === 'migrate'
            ? {
                label: classifiedName.label,
                owner: OWNER,
                subregistry: RESOLVER,
                resolver: RESOLVER,
              }
            : null,
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
            registryPath:
              classifiedName.action === 'migrate'
                ? {
                    type: 'eth-registry-2ld' as const,
                    registry: RESOLVER,
                    label: classifiedName.label,
                    resource: 1n,
                  }
                : {
                    type: 'parent-subregistry' as const,
                    rootRegistry: RESOLVER,
                    parentName: classifiedName.parentName ?? 'alice.eth',
                    label: classifiedName.label,
                    resource: 1n,
                  },
            expectedOwner: OWNER,
          },
        ],
      }
    },
  )
  return {
    hcaAddress: HCA,
    hcaDeploymentRequired: false,
    migrationOwner: OWNER,
    classified,
    registryContext,
    ineligible: [],
    groups: groupClassifiedNames([...classified]),
    preflight: {
      skipFetchProfilesPhase: true,
    },
    ownedPermRes: RESOLVER,
    profiles: new Map(),
    directRoutes: new Map(
      nameExecutions.flatMap((execution) =>
        execution.directRoute
          ? [[execution.classified.domain.name, execution.directRoute] as const]
          : [],
      ),
    ),
    atomicBatches:
      nameExecutions.length === 0
        ? []
        : [
            {
              index: 0,
              names: nameExecutions.map(
                ({ classified: name }) => name.domain.name,
              ),
              operations: nameExecutions.map(({ classified: name }) => ({
                name: name.domain.name,
                action: name.action,
              })),
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

const planFor = (labels: readonly string[] = ['alice']): MigrationPlan =>
  planFromClassified(labels.map(classifiedFor))

const runExecute = async (
  overrides: {
    plan?: MigrationPlan
    refreshAccount?: () => Promise<void>
    onBatchComplete?: OnBatchComplete
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
    reconcileBeforeSubmit: overrides.reconcileBeforeSubmit,
  })
  return { progressEvents, refreshAccount, result }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()

  let nextTransaction = 0
  const revocationTransactionIds = new Set<string>()
  mocks.startTransaction.mockImplementation(
    (transaction: { request?: { data?: string } }) => {
      const transactionId = `tx-${nextTransaction++}`
      const data = transaction.request?.data
      if (
        typeof data === 'string' &&
        data.startsWith(REVOKE_SELECTOR) &&
        data.slice(-64) === '0'.repeat(64)
      ) {
        revocationTransactionIds.add(transactionId)
      }
      return transactionId
    },
  )
  const hashForTransaction = (txId: string) =>
    hashFor(Number.parseInt(txId.slice('tx-'.length), 10) + 1)
  mocks.waitForTransactionHash.mockImplementation((txId: string) =>
    Promise.resolve(hashForTransaction(txId)),
  )
  mocks.waitForTransaction.mockImplementation((txId: string) => {
    if (revocationTransactionIds.has(txId)) {
      ethRegistryOperatorGranted = false
    }
    return Promise.resolve({ hash: hashForTransaction(txId) })
  })

  mocks.buildHcaDeploymentCall.mockReturnValue({
    to: FACTORY,
    data: DEPLOY_DATA,
    value: 0n,
  })
  mocks.verifyStandaloneHca.mockResolvedValue(HCA)
  mocks.checkMigrationApprovals.mockResolvedValue({})
  mocks.planMigrationApprovals.mockReturnValue([])
  mocks.buildMigrationApprovalCall.mockImplementation(
    (approval: MigrationApproval) => ({
      to: approval.contractAddress,
      data: GRANT_DATA,
      value: 0n,
    }),
  )
  mocks.checkResolverReadiness.mockResolvedValue({
    status: 'verified',
    resolver: RESOLVER,
    implementation: RESOLVER,
    hcaHasRootRoles: true,
    walletHasWildcardRoles: true,
  })
  mocks.assertCopyMigrationReadiness.mockResolvedValue(undefined)
  mocks.assertCopySourcesFresh.mockResolvedValue(undefined)
  mocks.buildAtomicMigrationBatches.mockImplementation(
    async ({
      hca,
      classified,
      estimateOuterGas,
    }: BuildAtomicMigrationBatchesParams) => {
      const names = classified.map(({ domain }) => domain.name)
      const outerCall = { to: hca, data: OUTER_DATA, value: 0n }
      const estimatedGas = await estimateOuterGas({
        call: outerCall,
        names,
        innerExecutions: [],
      })
      return {
        resolver: RESOLVER,
        batches: [
          {
            index: 0,
            names,
            operations: classified.map(({ domain, action }) => ({
              name: domain.name,
              action,
            })),
            nameExecutions: [],
            innerExecutions: [],
            outerCall,
            estimatedGas,
            verificationExpectations: [],
          },
        ],
      }
    },
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
  ethRegistryOperatorGranted = false
  readContractMock.mockImplementation(
    ({ functionName }: { functionName: string }) => {
      if (functionName === 'ownerOf') return Promise.resolve(OWNER)
      if (functionName === 'balanceOf') return Promise.resolve(1n)
      if (functionName === 'isApprovedForAll')
        return Promise.resolve(ethRegistryOperatorGranted)
      return Promise.resolve(true)
    },
  )
  getTransactionReceiptMock.mockResolvedValue({
    status: 'success',
    blockNumber: 123n,
  } as TransactionReceipt)
  getTransactionMock.mockResolvedValue({
    from: OWNER,
    nonce: 1,
    blockNumber: 100n,
  })
  waitForReceiptMock.mockResolvedValue({
    status: 'success',
    blockNumber: 123n,
  } as TransactionReceipt)
})

describe('executeMigration HCA orchestration', () => {
  it('durably retains the full tree while advancing only verified gas-split nodes', async () => {
    const parent = classifiedFor('alice')
    const copy = copyClassifiedFor()
    const plan = planFromClassified([parent, copy], [parent, copy])
    mocks.buildAtomicMigrationBatches.mockImplementation(
      async ({
        hca,
        classified,
        estimateOuterGas,
      }: BuildAtomicMigrationBatchesParams) => {
        const first = classified.slice(0, 1)
        const names = first.map(({ domain }) => domain.name)
        const outerCall = { to: hca, data: OUTER_DATA, value: 0n }
        return {
          resolver: RESOLVER,
          batches: [
            {
              index: 0,
              names,
              operations: first.map(({ domain, action }) => ({
                name: domain.name,
                action,
              })),
              nameExecutions: [],
              innerExecutions: [],
              outerCall,
              estimatedGas: await estimateOuterGas({
                call: outerCall,
                names,
                innerExecutions: [],
              }),
              verificationExpectations: [],
            },
          ],
        }
      },
    )
    mocks.waitForTransactionHash
      .mockResolvedValueOnce(hashFor(1))
      .mockRejectedValueOnce(new Error('provider response was lost'))

    await expect(runExecute({ plan })).rejects.toBeInstanceOf(Error)

    const recovery = loadMigrationRecoverySnapshot({
      chainId: 11155111,
      owner: OWNER,
      hca: HCA,
    })
    expect(recovery).toMatchObject({
      registryOperations: [
        { name: parent.domain.name, action: 'migrate' },
        { name: copy.domain.name, action: 'copy' },
      ],
      completedOperations: [{ name: parent.domain.name, action: 'migrate' }],
      remainingOperations: [{ name: copy.domain.name, action: 'copy' }],
    })
    expect(recovery?.registryDomains.map(({ name }) => name)).toEqual([
      parent.domain.name,
      copy.domain.name,
    ])
    expect(recovery?.profiles.size).toBe(2)
  })

  it('retains the final receipt through cleanup and resumes without duplicate registration', async () => {
    const parent = classifiedFor('alice')
    const copy = copyClassifiedFor()
    const basePlan = planFromClassified([parent, copy], [parent, copy])
    const plan = {
      ...basePlan,
      preflight: {
        ...basePlan.preflight,
        migrationApprovals: [MANAGER_APPROVAL],
      },
    }
    mocks.planMigrationApprovals.mockReturnValue([MANAGER_APPROVAL])
    ethRegistryOperatorGranted = true
    mocks.waitForTransactionHash
      .mockResolvedValueOnce(hashFor(1))
      .mockResolvedValueOnce(hashFor(2))
      .mockRejectedValueOnce(new Error('cleanup provider response was lost'))

    await expect(runExecute({ plan })).rejects.toMatchObject({
      name: 'MigrationCleanupError',
    })

    const scope = { chainId: 11155111, owner: OWNER, hca: HCA }
    expect(loadMigrationRecoverySnapshot(scope)?.remainingOperations).toEqual([
      { name: parent.domain.name, action: 'migrate' },
      { name: copy.domain.name, action: 'copy' },
    ])
    expect(loadSubmittedAtomicMigrationBatches(scope)).toEqual([
      expect.objectContaining({
        hash: hashFor(2),
        operations: [
          { name: parent.domain.name, action: 'migrate' },
          { name: copy.domain.name, action: 'copy' },
        ],
      }),
    ])

    mocks.waitForTransactionHash.mockResolvedValue(hashFor(4))
    mocks.buildAtomicMigrationBatches.mockClear()

    const { result } = await runExecute({
      plan,
      reconcileBeforeSubmit: true,
    })

    expect(mocks.buildAtomicMigrationBatches).not.toHaveBeenCalled()
    expect(result).toMatchObject({ completed: 2, migrated: 1, copied: 1 })
    expect(loadMigrationRecoverySnapshot(scope)).toBeNull()
    expect(loadSubmittedAtomicMigrationBatches(scope)).toEqual([])
  })

  it('preserves unrelated same-scope journal entries after copy recovery cleanup', async () => {
    const parent = classifiedFor('alice')
    const copy = copyClassifiedFor()
    const plan = planFromClassified([parent, copy], [parent, copy])
    const scope = { chainId: 11155111, owner: OWNER, hca: HCA }
    const unrelatedIntent = {
      id: 'unrelated-intent',
      names: ['carol.eth'],
      operations: [{ name: 'carol.eth', action: 'migrate' as const }],
    }
    const unrelatedSubmission = {
      intentId: 'unrelated-submission-intent',
      hash: hashFor(9),
      names: ['bob.eth'],
      operations: [{ name: 'bob.eth', action: 'migrate' as const }],
    }
    persistPendingAtomicMigrationIntent(scope, unrelatedIntent)
    persistSubmittedAtomicMigrationBatch(scope, unrelatedSubmission)

    await runExecute({ plan })

    expect(loadMigrationRecoverySnapshot(scope)).toBeNull()
    expect(loadPendingAtomicMigrationIntents(scope)).toEqual([unrelatedIntent])
    expect(loadSubmittedAtomicMigrationBatches(scope)).toEqual([
      unrelatedSubmission,
    ])
  })

  it('revalidates the complete copy tree around estimation and submission', async () => {
    const parent = classifiedFor('alice')
    const copy = copyClassifiedFor()
    const plan = planFromClassified([parent, copy], [parent, copy])

    await runExecute({ plan })

    expect(mocks.assertCopyMigrationReadiness).toHaveBeenCalledTimes(2)
    expect(
      mocks.assertCopyMigrationReadiness.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.buildAtomicMigrationBatches.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    )
    expect(
      mocks.assertCopyMigrationReadiness.mock.invocationCallOrder[1],
    ).toBeLessThan(
      mocks.startTransaction.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    )
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
        {
          type: 'atomic-batch' as const,
          index: 0,
          total: 1,
          count: 1,
          migrateCount: 1,
          copyCount: 0,
        },
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

  it('updates retry protection when the wallet replaces the submitted transaction', async () => {
    const replacementReceipt = {
      status: 'success',
      blockNumber: 123n,
      transactionHash: hashFor(9),
    } as TransactionReceipt
    mocks.waitForTransaction.mockResolvedValueOnce({
      hash: hashFor(9),
      receipt: replacementReceipt,
    })
    mocks.verifyAtomicMigrationBatch.mockImplementationOnce(() => {
      expect(
        loadSubmittedAtomicMigrationBatches({
          chainId: 11155111,
          owner: OWNER,
          hca: HCA,
        }),
      ).toEqual([
        expect.objectContaining({
          hash: hashFor(9),
          names: ['alice.eth'],
        }),
      ])
      return Promise.resolve({
        batchIndex: 0,
        status: 'confirmed' as const,
        results: [],
      })
    })

    const { result } = await runExecute()

    expect(result.txHashes).toEqual([hashFor(9)])
    expect(
      loadSubmittedAtomicMigrationBatches({
        chainId: 11155111,
        owner: OWNER,
        hca: HCA,
      }),
    ).toEqual([])
  })

  it('submits a persistent approval before the atomic batch', async () => {
    mocks.planMigrationApprovals.mockReturnValue([APPROVAL])
    waitForReceiptMock.mockResolvedValueOnce({
      status: 'reverted',
      blockNumber: 123n,
    } as TransactionReceipt)
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [APPROVAL],
      },
    }

    await expect(runExecute({ plan })).rejects.toSatisfy(
      (error) => error instanceof Error && error.name === 'MigrationError',
    )

    expect(mocks.buildMigrationApprovalCall).toHaveBeenCalledWith(APPROVAL)
    expect(mocks.buildAtomicMigrationBatches).not.toHaveBeenCalled()
  })

  it('keeps temporary-approval cleanup within the planned step count', async () => {
    mocks.planMigrationApprovals.mockReturnValue([APPROVAL, MANAGER_APPROVAL])
    ethRegistryOperatorGranted = true
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [APPROVAL, MANAGER_APPROVAL],
      },
      stepDescriptors: [
        { type: 'approval' as const, approvalId: APPROVAL.id },
        { type: 'approval' as const, approvalId: MANAGER_APPROVAL.id },
        {
          type: 'atomic-batch' as const,
          index: 0,
          total: 1,
          count: 1,
          migrateCount: 1,
          copyCount: 0,
        },
        { type: 'cleanup' as const, approvalId: MANAGER_APPROVAL.id },
      ],
    }

    const { progressEvents } = await runExecute({ plan })

    expect(
      Math.max(...progressEvents.map(({ currentStep }) => currentStep)),
    ).toBe(4)
    expect(progressEvents.at(-1)).toMatchObject({
      currentStep: 4,
      totalSteps: 4,
      description: 'Temporary access removed',
    })
  })

  it('retries a permission-shaped gas estimate after a freshly mined approval', async () => {
    vi.useFakeTimers()
    try {
      mocks.planMigrationApprovals.mockReturnValue([APPROVAL])
      estimateGasMock
        .mockRejectedValueOnce(permissionMissingError())
        .mockResolvedValueOnce(500_000n)
      const plan = {
        ...planFor(),
        preflight: {
          ...planFor().preflight,
          migrationApprovals: [APPROVAL],
        },
      }

      const execution = runExecute({ plan })
      await vi.runAllTimersAsync()
      const { result } = await execution

      expect(estimateGasMock).toHaveBeenCalledTimes(2)
      expect(estimateGasMock).toHaveBeenNthCalledWith(1, {
        account: OWNER,
        to: HCA,
        data: OUTER_DATA,
        value: 0n,
      })
      expect(estimateGasMock).toHaveBeenNthCalledWith(2, {
        account: OWNER,
        to: HCA,
        data: OUTER_DATA,
        value: 0n,
      })
      expect(mocks.buildMigrationApprovalCall).toHaveBeenCalledOnce()
      expect(mocks.startTransaction).toHaveBeenCalledTimes(2)
      expect(result.txHashes).toEqual([hashFor(1), hashFor(2)])
    } finally {
      vi.useRealTimers()
    }
  })

  it('bounds stale-approval estimate retries before opening the atomic wallet prompt', async () => {
    vi.useFakeTimers()
    try {
      mocks.planMigrationApprovals.mockReturnValue([APPROVAL])
      estimateGasMock.mockRejectedValue(permissionMissingError())
      const plan = {
        ...planFor(),
        preflight: {
          ...planFor().preflight,
          migrationApprovals: [APPROVAL],
        },
      }

      const execution = runExecute({ plan }).catch((error: unknown) => error)
      await vi.runAllTimersAsync()
      const error = await execution

      expect(error).toBeInstanceOf(Error)
      expect(estimateGasMock).toHaveBeenCalledTimes(6)
      expect(mocks.buildMigrationApprovalCall).toHaveBeenCalledOnce()
      expect(mocks.startTransaction).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not retry unrelated gas-estimation failures', async () => {
    mocks.planMigrationApprovals.mockReturnValue([APPROVAL])
    estimateGasMock.mockRejectedValueOnce(new Error('RPC unavailable'))
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [APPROVAL],
      },
    }

    await expect(runExecute({ plan })).rejects.toBeInstanceOf(Error)

    expect(estimateGasMock).toHaveBeenCalledOnce()
    expect(mocks.startTransaction).toHaveBeenCalledOnce()
  })

  it('blocks a stale permission preview before opening the first wallet prompt', async () => {
    getCodeMock.mockResolvedValueOnce('0x')
    const plan = {
      ...planFor(),
      hcaDeploymentRequired: true,
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [APPROVAL],
      },
      stepDescriptors: [
        { type: 'approval' as const, approvalId: APPROVAL.id },
        {
          type: 'atomic-batch' as const,
          index: 0,
          total: 1,
          count: 1,
          migrateCount: 1,
          copyCount: 0,
        },
      ],
    }

    const error = await runExecute({ plan }).catch((cause: unknown) => cause)

    expect(error).toMatchObject({
      name: 'MigrationPlanChangedError',
      plannedApprovalKeys: [
        `${APPROVAL.contractAddress.toLowerCase()}:${APPROVAL.operatorAddress.toLowerCase()}`,
      ],
      currentApprovalKeys: [],
    })
    expect(mocks.buildHcaDeploymentCall).not.toHaveBeenCalled()
    expect(mocks.verifyStandaloneHca).not.toHaveBeenCalled()
    expect(mocks.startTransaction).not.toHaveBeenCalled()
    expect(mocks.buildMigrationApprovalCall).not.toHaveBeenCalled()
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

  it('persists an atomic batch hash before post-state verification', async () => {
    mocks.verifyAtomicMigrationBatch.mockRejectedValueOnce(
      new Error('owner mismatch'),
    )

    await expect(runExecute()).rejects.toSatisfy(
      (error) => error instanceof Error && error.name === 'MigrationError',
    )

    expect(
      loadSubmittedAtomicMigrationBatches({
        chainId: 11155111,
        owner: OWNER,
        hca: HCA,
      }),
    ).toEqual([
      expect.objectContaining({
        hash: hashFor(1),
        names: ['alice.eth'],
      }),
    ])
    expect(
      loadPendingAtomicMigrationIntents({
        chainId: 11155111,
        owner: OWNER,
        hca: HCA,
      }),
    ).toEqual([])
    expect(mocks.waitForTransactionHash).toHaveBeenCalledWith('tx-0')
  })

  it('blocks an intent whose broadcast hash was not durably recorded', async () => {
    persistPendingAtomicMigrationIntent(
      { chainId: 11155111, owner: OWNER, hca: HCA },
      {
        id: 'unresolved-intent',
        names: ['alice.eth'],
        operations: [{ name: 'alice.eth', action: 'migrate' }],
      },
    )

    const error = await runExecute().catch((cause: unknown) => cause)

    expect(error).toMatchObject({
      name: 'MigrationError',
      step: 'Reconciling previous atomic migration',
      cause: { name: 'AtomicMigrationIntentIndeterminateError' },
    })
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })

  it('durably records the batch intent before opening the wallet prompt', async () => {
    mocks.startTransaction.mockImplementationOnce(() => {
      expect(
        loadPendingAtomicMigrationIntents({
          chainId: 11155111,
          owner: OWNER,
          hca: HCA,
        }),
      ).toEqual([
        expect.objectContaining({
          names: ['alice.eth'],
        }),
      ])
      return 'tx-0'
    })

    await runExecute()

    expect(mocks.startTransaction).toHaveBeenCalledOnce()
  })

  it('keeps retry protection when submission fails before returning a hash', async () => {
    mocks.waitForTransactionHash.mockRejectedValueOnce(
      new Error('provider response was lost'),
    )

    await expect(runExecute()).rejects.toSatisfy(
      (error) => error instanceof Error && error.name === 'MigrationError',
    )

    expect(
      loadPendingAtomicMigrationIntents({
        chainId: 11155111,
        owner: OWNER,
        hca: HCA,
      }),
    ).toEqual([expect.objectContaining({ names: ['alice.eth'] })])

    mocks.reconcileAtomicMigrationBatch.mockResolvedValueOnce({
      status: 'incomplete',
      verification: {
        batchIndex: 0,
        status: 'confirmed',
        results: [{ expectationId: 'alice.eth:name-owner', satisfied: false }],
      },
      mismatches: [{ expectationId: 'alice.eth:name-owner' }],
    })

    await expect(
      runExecute({
        reconcileBeforeSubmit: true,
      }),
    ).resolves.toBeDefined()
    expect(mocks.startTransaction).toHaveBeenCalledTimes(2)
    expect(
      loadPendingAtomicMigrationIntents({
        chainId: 11155111,
        owner: OWNER,
        hca: HCA,
      }),
    ).toEqual([])
  })

  it('clears an unsubmitted intent after an explicit wallet rejection', async () => {
    const rejection = Object.assign(new Error('User rejected the request'), {
      name: 'UserRejectedRequestError',
    })
    mocks.waitForTransactionHash.mockRejectedValueOnce(rejection)

    await expect(runExecute()).rejects.toSatisfy(
      (error) =>
        error instanceof Error && error.name === 'MigrationUserRejectedError',
    )

    expect(
      loadPendingAtomicMigrationIntents({
        chainId: 11155111,
        owner: OWNER,
        hca: HCA,
      }),
    ).toEqual([])

    mocks.reconcileAtomicMigrationBatch.mockResolvedValueOnce({
      status: 'incomplete',
      verification: {
        batchIndex: 0,
        status: 'confirmed',
        results: [{ expectationId: 'alice.eth:name-owner', satisfied: false }],
      },
      mismatches: [{ expectationId: 'alice.eth:name-owner' }],
    })

    await expect(
      runExecute({ reconcileBeforeSubmit: true }),
    ).resolves.toBeDefined()
    expect(mocks.startTransaction).toHaveBeenCalledTimes(2)
  })

  it('never resubmits a confirmed-success batch whose post-state does not verify', async () => {
    mocks.verifyAtomicMigrationBatch.mockRejectedValue(
      new AtomicMigrationBatchVerificationError({
        message: 'owner mismatch',
        batchIndex: 0,
        verification: {
          batchIndex: 0,
          status: 'confirmed',
          results: [
            { expectationId: 'alice.eth:name-owner', satisfied: false },
          ],
        },
        failures: [{ expectationId: 'alice.eth:name-owner' }],
      }),
    )
    await expect(runExecute()).rejects.toBeInstanceOf(Error)
    expect(mocks.startTransaction).toHaveBeenCalledOnce()

    const error = await runExecute({
      reconcileBeforeSubmit: true,
    }).catch((cause: unknown) => cause)

    expect(error).toMatchObject({
      name: 'MigrationError',
      step: 'Reconciling previous atomic migration',
      cause: { name: 'SubmittedAtomicMigrationVerificationError' },
    })
    expect(getTransactionReceiptMock).toHaveBeenCalledWith({
      hash: hashFor(1),
    })
    expect(mocks.startTransaction).toHaveBeenCalledOnce()
    expect(mocks.reconcileAtomicMigrationBatch).not.toHaveBeenCalled()
  })

  it('retries a reverted journaled batch only while its source token is still owned', async () => {
    persistSubmittedAtomicMigrationBatch(
      { chainId: 11155111, owner: OWNER, hca: HCA },
      {
        intentId: 'reverted-intent',
        hash: hashFor(9),
        names: ['alice.eth'],
        operations: [{ name: 'alice.eth', action: 'migrate' }],
      },
    )
    getTransactionReceiptMock.mockResolvedValueOnce({
      status: 'reverted',
      blockNumber: 122n,
    } as TransactionReceipt)

    const { result } = await runExecute()

    expect(readContractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'ownerOf',
        args: [BigInt(planFor().classified[0]?.domain.labelhash ?? 0)],
      }),
    )
    expect(mocks.startTransaction).toHaveBeenCalledOnce()
    expect(result.txHashes).toEqual([hashFor(1)])
    expect(
      loadSubmittedAtomicMigrationBatches({
        chainId: 11155111,
        owner: OWNER,
        hca: HCA,
      }),
    ).toEqual([])
  })

  it('reconciles current state when a replacement makes the journaled hash unavailable', async () => {
    persistSubmittedAtomicMigrationBatch(
      { chainId: 11155111, owner: OWNER, hca: HCA },
      {
        intentId: 'replaced-intent',
        hash: hashFor(9),
        names: ['alice.eth'],
        operations: [{ name: 'alice.eth', action: 'migrate' }],
      },
    )
    getTransactionReceiptMock.mockRejectedValueOnce(
      new Error('transaction not found'),
    )
    mocks.reconcileAtomicMigrationBatch.mockResolvedValueOnce({
      status: 'incomplete',
      verification: {
        batchIndex: 0,
        status: 'confirmed',
        results: [{ expectationId: 'alice.eth:name-owner', satisfied: false }],
      },
      mismatches: [{ expectationId: 'alice.eth:name-owner' }],
    })

    await expect(
      runExecute({ reconcileBeforeSubmit: true }),
    ).resolves.toBeDefined()

    expect(readContractMock).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'ownerOf' }),
    )
    expect(mocks.startTransaction).toHaveBeenCalledOnce()
    expect(
      loadSubmittedAtomicMigrationBatches({
        chainId: 11155111,
        owner: OWNER,
        hca: HCA,
      }),
    ).toEqual([])
  })

  it('reconciles an already-complete batch only when its attempt was recorded', async () => {
    const onBatchComplete = vi.fn()
    persistPendingAtomicMigrationIntent(
      { chainId: 11155111, owner: OWNER, hca: HCA },
      {
        id: 'direct-intent',
        names: ['alice.eth'],
        operations: [{ name: 'alice.eth', action: 'migrate' }],
      },
    )

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
    expect(onBatchComplete).toHaveBeenCalledWith([
      { name: 'alice.eth', action: 'migrate' },
    ])
    expect(result.completed).toBe(1)
    expect(result.txHashes).toEqual([])
  })

  it('rejects exact direct V2 state without a recorded attempt', async () => {
    const error = await runExecute({ reconcileBeforeSubmit: true }).catch(
      (cause: unknown) => cause,
    )

    expect(error).toMatchObject({
      name: 'MigrationError',
      step: 'Reconciling previous atomic migration',
      cause: {
        name: 'AtomicMigrationIntentIndeterminateError',
        intentId: 'unrecorded-exact-v2-state',
        names: ['alice.eth'],
      },
    })
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })

  it('reconciles an exact copied name only when a durable attempt was recorded', async () => {
    const copy = copyClassifiedFor()
    const plan = planFromClassified([copy], [classifiedFor('alice'), copy])
    const onBatchComplete = vi.fn()
    persistPendingAtomicMigrationIntent(
      { chainId: 11155111, owner: OWNER, hca: HCA },
      {
        id: 'copy-intent',
        names: [copy.domain.name],
        operations: [{ name: copy.domain.name, action: 'copy' }],
      },
    )

    const { result } = await runExecute({
      plan,
      onBatchComplete,
      reconcileBeforeSubmit: true,
    })

    expect(mocks.reconcileAtomicMigrationBatch).toHaveBeenCalledOnce()
    expect(mocks.buildAtomicMigrationBatches).not.toHaveBeenCalled()
    expect(mocks.startTransaction).not.toHaveBeenCalled()
    expect(onBatchComplete).toHaveBeenCalledWith([
      { name: copy.domain.name, action: 'copy' },
    ])
    expect(result).toMatchObject({
      completed: 1,
      migrated: 0,
      copied: 1,
      completedOperations: [{ name: copy.domain.name, action: 'copy' }],
    })
    expect(
      loadPendingAtomicMigrationIntents({
        chainId: 11155111,
        owner: OWNER,
        hca: HCA,
      }),
    ).toEqual([])
  })

  it('does not accept exact V2 copy state without a recorded attempt', async () => {
    const copy = copyClassifiedFor()
    const plan = planFromClassified([copy], [classifiedFor('alice'), copy])
    const error = await runExecute({
      plan,
      reconcileBeforeSubmit: true,
    }).catch((cause: unknown) => cause)

    expect(error).toMatchObject({
      name: 'MigrationError',
      cause: {
        name: 'AtomicMigrationIntentIndeterminateError',
        intentId: 'unrecorded-exact-v2-state',
        names: [copy.domain.name],
      },
    })
    expect(mocks.reconcileAtomicMigrationBatch).toHaveBeenCalledOnce()
    expect(mocks.assertCopyMigrationReadiness).not.toHaveBeenCalled()
    expect(mocks.buildAtomicMigrationBatches).not.toHaveBeenCalled()
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })

  it('fails closed when a journaled action no longer matches the plan', async () => {
    const copy = copyClassifiedFor()
    const plan = planFromClassified([copy], [classifiedFor('alice'), copy])
    persistSubmittedAtomicMigrationBatch(
      { chainId: 11155111, owner: OWNER, hca: HCA },
      {
        intentId: 'mismatched-copy-intent',
        hash: hashFor(9),
        names: [copy.domain.name],
        operations: [{ name: copy.domain.name, action: 'migrate' }],
      },
    )

    const error = await runExecute({
      plan,
      reconcileBeforeSubmit: true,
    }).catch((cause: unknown) => cause)

    expect(error).toMatchObject({
      name: 'MigrationError',
      step: 'Reconciling previous atomic migration',
      cause: { name: 'SubmittedAtomicMigrationIndeterminateError' },
    })
    expect(getTransactionReceiptMock).not.toHaveBeenCalled()
    expect(mocks.reconcileAtomicMigrationBatch).not.toHaveBeenCalled()
    expect(mocks.buildAtomicMigrationBatches).not.toHaveBeenCalled()
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })

  it('rebuilds a partial tree from the immutable registry context without re-registering its completed parent', async () => {
    const parent = classifiedFor('alice')
    const copy = copyClassifiedFor()
    const plan = planFromClassified([parent, copy], [parent, copy])
    const onBatchComplete = vi.fn()
    persistPendingAtomicMigrationIntent(
      { chainId: 11155111, owner: OWNER, hca: HCA },
      {
        id: 'completed-parent-intent',
        names: [parent.domain.name],
        operations: [{ name: parent.domain.name, action: 'migrate' }],
      },
    )
    mocks.reconcileAtomicMigrationBatch
      .mockResolvedValueOnce({
        status: 'complete',
        verification: { batchIndex: 0, status: 'confirmed', results: [] },
      })
      .mockResolvedValueOnce({
        status: 'incomplete',
        verification: { batchIndex: 0, status: 'confirmed', results: [] },
        mismatches: [{ expectationId: `${copy.domain.name}:name-owner` }],
      })
    estimateGasMock.mockImplementationOnce(() => {
      const scope = { chainId: 11155111, owner: OWNER, hca: HCA }
      expect(loadMigrationRecoverySnapshot(scope)).toMatchObject({
        completedOperations: [{ name: parent.domain.name, action: 'migrate' }],
        remainingOperations: [{ name: copy.domain.name, action: 'copy' }],
      })
      expect(loadPendingAtomicMigrationIntents(scope)).toEqual([])
      return Promise.resolve(500_000n)
    })

    const { result } = await runExecute({
      plan,
      onBatchComplete,
      reconcileBeforeSubmit: true,
    })

    expect(mocks.reconcileAtomicMigrationBatch).toHaveBeenCalledTimes(2)
    expect(mocks.assertCopySourcesFresh).toHaveBeenCalledWith({
      publicClient: PUBLIC_CLIENT,
      wallet: OWNER,
      copies: [copy],
    })
    expect(mocks.buildAtomicMigrationBatches).toHaveBeenCalledWith(
      expect.objectContaining({
        classified: [copy],
        registryContext: [parent, copy],
      }),
    )
    expect(onBatchComplete).toHaveBeenNthCalledWith(1, [
      { name: parent.domain.name, action: 'migrate' },
    ])
    expect(onBatchComplete).toHaveBeenNthCalledWith(
      2,
      [{ name: copy.domain.name, action: 'copy' }],
      hashFor(1),
    )
    expect(result).toMatchObject({ completed: 2, migrated: 1, copied: 1 })
  })

  it('checks copied V1 state on retry without requesting token ownership transfer', async () => {
    const copy = copyClassifiedFor()
    const plan = planFromClassified([copy], [classifiedFor('alice'), copy])
    mocks.reconcileAtomicMigrationBatch.mockResolvedValueOnce({
      status: 'incomplete',
      verification: { batchIndex: 0, status: 'confirmed', results: [] },
      mismatches: [{ expectationId: `${copy.domain.name}:name-owner` }],
    })

    await runExecute({ plan, reconcileBeforeSubmit: true })

    expect(mocks.assertCopySourcesFresh).toHaveBeenCalledWith({
      publicClient: PUBLIC_CLIENT,
      wallet: OWNER,
      copies: [copy],
    })
    expect(mocks.assertCopyMigrationReadiness).toHaveBeenCalledTimes(2)
    expect(readContractMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'ownerOf' }),
    )
    expect(readContractMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'balanceOf' }),
    )
  })

  it('finishes progress at the planned total when retry reconciliation skips setup and submission', async () => {
    ethRegistryOperatorGranted = true
    const plan = {
      ...planFor(),
      hcaDeploymentRequired: true,
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [MANAGER_APPROVAL],
      },
      stepDescriptors: [
        { type: 'deploy-hca' as const },
        { type: 'approval' as const, approvalId: MANAGER_APPROVAL.id },
        {
          type: 'atomic-batch' as const,
          index: 0,
          total: 1,
          count: 1,
          migrateCount: 1,
          copyCount: 0,
        },
        { type: 'cleanup' as const, approvalId: MANAGER_APPROVAL.id },
      ],
    }
    persistPendingAtomicMigrationIntent(
      { chainId: 11155111, owner: OWNER, hca: HCA },
      {
        id: 'completed-progress-intent',
        names: ['alice.eth'],
        operations: [{ name: 'alice.eth', action: 'migrate' }],
      },
    )

    const { progressEvents } = await runExecute({
      plan,
      reconcileBeforeSubmit: true,
    })

    expect(mocks.startTransaction).toHaveBeenCalledOnce()
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
    persistPendingAtomicMigrationIntent(
      { chainId: 11155111, owner: OWNER, hca: HCA },
      {
        id: 'completed-alice-intent',
        names: ['alice.eth'],
        operations: [{ name: 'alice.eth', action: 'migrate' }],
      },
    )

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
    expect(onBatchComplete).toHaveBeenNthCalledWith(1, [
      { name: 'alice.eth', action: 'migrate' },
    ])
    expect(onBatchComplete).toHaveBeenNthCalledWith(
      2,
      [{ name: 'bob.eth', action: 'migrate' }],
      hashFor(1),
    )
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

  it('blocks a deterministic retry mismatch when the source token is no longer wallet-owned', async () => {
    mocks.reconcileAtomicMigrationBatch.mockResolvedValueOnce({
      status: 'incomplete',
      verification: {
        batchIndex: 0,
        status: 'confirmed',
        results: [{ expectationId: 'alice.eth:name-owner', satisfied: false }],
      },
      mismatches: [{ expectationId: 'alice.eth:name-owner' }],
    })
    readContractMock.mockResolvedValueOnce(
      '0x0000000000000000000000000000000000000099',
    )

    const error = await runExecute({
      reconcileBeforeSubmit: true,
    }).catch((cause: unknown) => cause)

    expect(error).toMatchObject({
      name: 'MigrationError',
      step: 'Reconciling previous atomic migration',
      cause: { name: 'MigrationSourceOwnershipError' },
    })
    expect(mocks.startTransaction).not.toHaveBeenCalled()
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

  it('records cleanup debt before opening the temporary approval wallet prompt', async () => {
    mocks.planMigrationApprovals.mockReturnValue([MANAGER_APPROVAL])
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [MANAGER_APPROVAL],
      },
    }
    const events: string[] = []
    const originalSetItem = localStorage.setItem.bind(localStorage)
    const storageSpy = vi
      .spyOn(localStorage, 'setItem')
      .mockImplementation((key, value) => {
        if (key.includes('approval-cleanup')) events.push('cleanup-recorded')
        return originalSetItem(key, value)
      })
    mocks.startTransaction.mockImplementation(() => {
      events.push('wallet-opened')
      return `tx-${events.filter((event) => event === 'wallet-opened').length - 1}`
    })

    try {
      await runExecute({ plan })
    } finally {
      storageSpy.mockRestore()
    }

    expect(events.indexOf('cleanup-recorded')).toBeGreaterThanOrEqual(0)
    expect(events.indexOf('cleanup-recorded')).toBeLessThan(
      events.indexOf('wallet-opened'),
    )
    expect(mocks.startTransaction.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({ retryCount: 0 }),
    )
  })

  it('blocks the temporary grant when durable cleanup storage cannot be written', async () => {
    mocks.planMigrationApprovals.mockReturnValue([MANAGER_APPROVAL])
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [MANAGER_APPROVAL],
      },
    }
    const storageSpy = vi
      .spyOn(localStorage, 'setItem')
      .mockImplementationOnce(() => {
        throw new Error('storage unavailable')
      })

    try {
      await expect(runExecute({ plan })).rejects.toMatchObject({
        name: 'MigrationError',
      })
    } finally {
      storageSpy.mockRestore()
    }

    expect(mocks.startTransaction).not.toHaveBeenCalled()
    expect(loadMigrationApprovalCleanupObligation(CLEANUP_SCOPE)).toBeNull()
  })

  it('revokes from durable debt when the submitted grant is not visible at the RPC head', async () => {
    mocks.planMigrationApprovals.mockReturnValue([MANAGER_APPROVAL])
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [MANAGER_APPROVAL],
      },
    }

    const { result } = await runExecute({ plan })

    expect(ethRegistryOperatorGranted).toBe(false)
    expect(revocationCalls()).toHaveLength(1)
    expect(result.txHashes).toEqual([hashFor(1), hashFor(2), hashFor(3)])
    expect(loadMigrationApprovalCleanupObligation(CLEANUP_SCOPE)).toBeNull()
  })

  it('fences the mined wallet replacement when the original grant hash was dropped', async () => {
    const submittedHash = hashFor(1)
    const replacementHash = hashFor(72)
    mocks.planMigrationApprovals.mockReturnValue([MANAGER_APPROVAL])
    mocks.waitForTransaction.mockImplementation((txId: string) => {
      if (txId === 'tx-0') {
        ethRegistryOperatorGranted = true
        return Promise.resolve({
          hash: replacementHash,
          receipt: {
            status: 'success',
            blockNumber: 121n,
            transactionHash: replacementHash,
          } as TransactionReceipt,
        })
      }
      if (txId === 'tx-2') ethRegistryOperatorGranted = false
      return Promise.resolve({
        hash: hashFor(Number.parseInt(txId.slice('tx-'.length), 10) + 1),
      })
    })
    getTransactionMock.mockImplementation(({ hash }: { hash: Hex }) => {
      if (hash === submittedHash) {
        return Promise.reject(new Error('dropped transaction unavailable'))
      }
      return Promise.resolve({ from: OWNER, nonce: 1, blockNumber: 121n })
    })
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [MANAGER_APPROVAL],
      },
    }

    const { result } = await runExecute({ plan })

    expect(result.txHashes).toEqual([replacementHash, hashFor(2), hashFor(3)])
    expect(getTransactionMock).not.toHaveBeenCalledWith({ hash: submittedHash })
    expect(getTransactionMock).toHaveBeenCalledWith({ hash: replacementHash })
    expect(loadMigrationApprovalCleanupObligation(CLEANUP_SCOPE)).toBeNull()
  })

  it('retains durable debt when head-lag cleanup is rejected', async () => {
    mocks.planMigrationApprovals.mockReturnValue([MANAGER_APPROVAL])
    mocks.waitForTransactionHash.mockImplementation((txId: string) =>
      txId === 'tx-2'
        ? Promise.reject(new Error('cleanup rejected'))
        : Promise.resolve(
            hashFor(Number.parseInt(txId.slice('tx-'.length), 10) + 1),
          ),
    )
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [MANAGER_APPROVAL],
      },
    }

    await expect(runExecute({ plan })).rejects.toMatchObject({
      name: 'MigrationCleanupError',
    })

    expect(revocationCalls()).toHaveLength(1)
    expect(loadMigrationApprovalCleanupObligation(CLEANUP_SCOPE)).toMatchObject(
      { grantHash: hashFor(1) },
    )
  })

  it('resolves the exact prompt after definitive grant rejection without a cleanup transaction', async () => {
    mocks.planMigrationApprovals.mockReturnValue([MANAGER_APPROVAL])
    const rejection = Object.assign(new Error('User rejected the request'), {
      name: 'UserRejectedRequestError',
    })
    mocks.waitForTransactionHash.mockRejectedValueOnce(rejection)
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [MANAGER_APPROVAL],
        migrationApprovalCleanups: [MANAGER_APPROVAL],
        standingMigrationApprovalCleanups: [],
      },
    }

    await expect(runExecute({ plan })).rejects.toMatchObject({
      name: 'MigrationUserRejectedError',
    })

    expect(revocationCalls()).toHaveLength(0)
    expect(loadMigrationApprovalCleanupObligation(CLEANUP_SCOPE)).toBeNull()
  })

  it('does not lose a known standing cleanup when a stale approval read plans a rejected grant', async () => {
    mocks.planMigrationApprovals.mockReturnValue([MANAGER_APPROVAL])
    const rejection = Object.assign(new Error('User rejected the request'), {
      name: 'UserRejectedRequestError',
    })
    mocks.waitForTransactionHash.mockRejectedValueOnce(rejection)
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [MANAGER_APPROVAL],
        migrationApprovalCleanups: [MANAGER_APPROVAL],
        standingMigrationApprovalCleanups: [MANAGER_APPROVAL],
      },
    }

    await expect(runExecute({ plan })).rejects.toMatchObject({
      name: 'MigrationUserRejectedError',
    })

    expect(revocationCalls()).toHaveLength(1)
  })

  it('revokes a temporary operator approval after a successful migration', async () => {
    mocks.planMigrationApprovals.mockReturnValue([MANAGER_APPROVAL])
    ethRegistryOperatorGranted = true
    waitForReceiptMock
      .mockResolvedValueOnce({
        status: 'success',
        blockNumber: 121n,
      } as TransactionReceipt)
      .mockResolvedValueOnce({
        status: 'success',
        blockNumber: 122n,
      } as TransactionReceipt)
    mocks.waitForTransaction.mockImplementation((txId: string) => {
      if (txId === 'tx-2') ethRegistryOperatorGranted = false
      return Promise.resolve({
        hash: hashFor(Number.parseInt(txId.slice('tx-'.length), 10) + 1),
      })
    })

    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [MANAGER_APPROVAL],
      },
    }
    const { result } = await runExecute({ plan })

    expect(mocks.buildMigrationApprovalCall).toHaveBeenCalledOnce()
    expect(mocks.buildMigrationApprovalCall).toHaveBeenCalledWith(
      MANAGER_APPROVAL,
    )
    expect(result.completed).toBe(1)
    expect(result.txHashes).toEqual([hashFor(1), hashFor(2), hashFor(3)])
    expect(ethRegistryOperatorGranted).toBe(false)
    expect(loadMigrationApprovalCleanupObligation(CLEANUP_SCOPE)).toBeNull()
  })

  it('surfaces cleanup rejection for the dedicated recovery action', async () => {
    mocks.planMigrationApprovals.mockReturnValue([MANAGER_APPROVAL])
    ethRegistryOperatorGranted = true
    mocks.waitForTransactionHash.mockImplementation((txId: string) =>
      txId === 'tx-2'
        ? Promise.reject(new Error('cleanup rejected'))
        : Promise.resolve(
            hashFor(Number.parseInt(txId.slice('tx-'.length), 10) + 1),
          ),
    )
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [MANAGER_APPROVAL],
      },
    }

    const error = await runExecute({ plan }).catch((cause: unknown) => cause)

    expect(error).toMatchObject({ name: 'MigrationCleanupError' })
    expect(mocks.verifyAtomicMigrationBatch).toHaveBeenCalledOnce()
  })

  it('revokes a standing grant left by an interrupted earlier session even when the rebuilt plan omits it', async () => {
    // Session B of Immunefi #89461: the grant is already live on-chain, so
    // preflight plans no approvals and a preflight-derived cleanup list would
    // be empty. The revocation must come from live chain state instead.
    ethRegistryOperatorGranted = true

    const { result } = await runExecute()

    expect(result.completed).toBe(1)
    const revocations = revocationCalls()
    expect(revocations).toHaveLength(1)
    const request = (
      revocations[0]?.[0] as {
        request: { from: string; to: string; data: string }
      }
    ).request
    expect(request.from).toBe(OWNER)
    expect(request.to).toBe(V2_CONTRACTS.ETHRegistry)
    expect(request.data.toLowerCase()).toContain(HCA.slice(2).toLowerCase())
  })

  it('honours a preflight-known standing cleanup when a later RPC read is stale false', async () => {
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [],
        migrationApprovalCleanups: [MANAGER_APPROVAL],
      },
    }

    const { result } = await runExecute({ plan })

    expect(result.completed).toBe(1)
    expect(revocationCalls()).toHaveLength(1)
    expect(result.txHashes).toEqual([hashFor(1), hashFor(2)])
  })

  it('honours a preflight-known standing cleanup after a later migration failure', async () => {
    const batchFailure = new AtomicMigrationBatchVerificationError({
      message: 'owner mismatch',
      batchIndex: 0,
      verification: { batchIndex: 0, status: 'confirmed', results: [] },
      failures: [],
    })
    mocks.verifyAtomicMigrationBatch.mockRejectedValue(batchFailure)
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [],
        migrationApprovalCleanups: [MANAGER_APPROVAL],
      },
    }

    await expect(runExecute({ plan })).rejects.toMatchObject({
      name: 'MigrationError',
    })
    expect(revocationCalls()).toHaveLength(1)
  })

  it('still attempts the revocation when the atomic batch leg fails', async () => {
    // Session A of Immunefi #89461: the grant lands, then a later wallet
    // prompt or verification fails. The revocation must not be skipped.
    ethRegistryOperatorGranted = true
    mocks.planMigrationApprovals.mockReturnValue([MANAGER_APPROVAL])
    mocks.verifyAtomicMigrationBatch.mockRejectedValue(
      new AtomicMigrationBatchVerificationError({
        message: 'owner mismatch',
        batchIndex: 0,
        verification: { batchIndex: 0, status: 'confirmed', results: [] },
        failures: [],
      }),
    )
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [MANAGER_APPROVAL],
      },
    }

    await expect(runExecute({ plan })).rejects.toMatchObject({
      name: 'MigrationError',
    })

    expect(revocationCalls()).toHaveLength(1)
  })

  it('surfaces the batch failure, not a cleanup error, when the best-effort revocation also fails', async () => {
    ethRegistryOperatorGranted = true
    mocks.waitForTransactionHash.mockRejectedValue(new Error('rpc down'))

    const error = await runExecute().catch((cause: unknown) => cause)

    expect(error).toMatchObject({ name: 'MigrationError' })
    expect(revocationCalls()).toHaveLength(1)
  })

  it('submits no transactions when no eligible names remain and no grant is standing', async () => {
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
      migrated: 0,
      copied: 0,
      completedOperations: [],
      txHashes: [],
      ineligible: [],
    })
    expect(getCodeMock).not.toHaveBeenCalled()
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })

  it('revokes a standing grant even when no eligible names remain', async () => {
    // Stranded state: an interrupted earlier session granted the temporary
    // operator approval and every v1 name has since been migrated, so this
    // run has nothing to migrate — the revocation must still happen.
    ethRegistryOperatorGranted = true

    const result = await executeMigration({
      plan: planFor([]),
      wagmiConfig: WAGMI,
      publicClient: PUBLIC_CLIENT,
      signer: SIGNER,
      hcaClient: HCA_CLIENT,
      refreshAccount: vi.fn(),
      onProgress: vi.fn(),
    })

    expect(result.completed).toBe(0)
    expect(revocationCalls()).toHaveLength(1)
    expect(result.txHashes).toHaveLength(1)
  })

  it('honours a preflight-known cleanup when no eligible names remain and the RPC is stale false', async () => {
    const emptyPlan = planFor([])
    const plan = {
      ...emptyPlan,
      preflight: {
        ...emptyPlan.preflight,
        migrationApprovals: [],
        migrationApprovalCleanups: [MANAGER_APPROVAL],
      },
    }

    const result = await executeMigration({
      plan,
      wagmiConfig: WAGMI,
      publicClient: PUBLIC_CLIENT,
      signer: SIGNER,
      hcaClient: HCA_CLIENT,
      refreshAccount: vi.fn(),
      onProgress: vi.fn(),
    })

    expect(result.completed).toBe(0)
    expect(revocationCalls()).toHaveLength(1)
    expect(result.txHashes).toEqual([hashFor(1)])
  })

  it('lets the migration failure action safely retry an uncertain cleanup transaction', async () => {
    const emptyPlan = planFor([])
    const obligation = recordMigrationApprovalCleanupRequired(CLEANUP_SCOPE)
    const pendingHash = hashFor(93)
    recordMigrationApprovalCleanupRevocationHash(
      CLEANUP_SCOPE,
      '00000000-0000-4000-8000-000000000093',
      [obligation.attemptId],
      pendingHash,
    )
    getTransactionReceiptMock.mockRejectedValue(
      new Error('pending receipt unavailable'),
    )

    await expect(
      executeMigration({
        plan: emptyPlan,
        wagmiConfig: WAGMI,
        publicClient: PUBLIC_CLIENT,
        signer: SIGNER,
        hcaClient: HCA_CLIENT,
        refreshAccount: vi.fn(),
        onProgress: vi.fn(),
      }),
    ).rejects.toMatchObject({ name: 'MigrationCleanupError' })
    expect(revocationCalls()).toHaveLength(0)

    await expect(
      executeMigration({
        plan: emptyPlan,
        wagmiConfig: WAGMI,
        publicClient: PUBLIC_CLIENT,
        signer: SIGNER,
        hcaClient: HCA_CLIENT,
        refreshAccount: vi.fn(),
        onProgress: vi.fn(),
        reconcileBeforeSubmit: true,
      }),
    ).resolves.toMatchObject({
      completed: 0,
      txHashes: [hashFor(1)],
    })
    expect(revocationCalls()).toHaveLength(1)
  })
})

describe('revokeStandingTemporaryHcaAccess', () => {
  it('retains debt until a cleanup transaction fences a higher-nonce pending grant', async () => {
    const grantHash = hashFor(90)
    const obligation = recordMigrationApprovalCleanupGrantAttempt(CLEANUP_SCOPE)
    recordMigrationApprovalCleanupGrantHash(
      CLEANUP_SCOPE,
      obligation.attemptId,
      grantHash,
    )
    getTransactionMock.mockImplementation(({ hash }: { hash: Hex }) => {
      if (hash === grantHash) {
        return Promise.resolve({ from: OWNER, nonce: 12, blockNumber: null })
      }
      return Promise.resolve({
        from: OWNER,
        nonce: hash === hashFor(1) ? 11 : 12,
        blockNumber: 123n,
      })
    })

    await expect(
      revokeStandingTemporaryHcaAccess({
        wagmiConfig: WAGMI,
        publicClient: PUBLIC_CLIENT,
        signer: SIGNER,
        walletAddress: OWNER,
        hcaAddress: HCA,
      }),
    ).rejects.toMatchObject({ name: 'MigrationCleanupError' })
    expect(loadMigrationApprovalCleanupObligation(CLEANUP_SCOPE)).toMatchObject(
      { attemptId: obligation.attemptId },
    )

    await expect(
      revokeStandingTemporaryHcaAccess({
        wagmiConfig: WAGMI,
        publicClient: PUBLIC_CLIENT,
        signer: SIGNER,
        walletAddress: OWNER,
        hcaAddress: HCA,
      }),
    ).resolves.toEqual([hashFor(2)])
    expect(revocationCalls()).toHaveLength(2)
    expect(loadMigrationApprovalCleanupObligation(CLEANUP_SCOPE)).toBeNull()
  })

  it('retains durable debt when a replacement cleanup succeeds but live approval remains granted', async () => {
    const submittedHash = hashFor(91)
    const replacementHash = hashFor(92)
    const replacementReceipt = {
      status: 'success',
      blockNumber: 456n,
      transactionHash: replacementHash,
    } as TransactionReceipt
    const obligation = recordMigrationApprovalCleanupRequired(CLEANUP_SCOPE)
    ethRegistryOperatorGranted = true
    mocks.waitForTransactionHash.mockResolvedValueOnce(submittedHash)
    mocks.waitForTransaction.mockResolvedValueOnce({
      hash: replacementHash,
      receipt: replacementReceipt,
    })

    await expect(
      revokeStandingTemporaryHcaAccess({
        wagmiConfig: WAGMI,
        publicClient: PUBLIC_CLIENT,
        signer: SIGNER,
        walletAddress: OWNER,
        hcaAddress: HCA,
      }),
    ).rejects.toMatchObject({ name: 'MigrationCleanupError' })

    expect(revocationCalls()).toHaveLength(1)
    expect(readContractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'isApprovedForAll',
        args: [OWNER, HCA],
        blockNumber: 456n,
      }),
    )
    expect(loadMigrationApprovalCleanupObligation(CLEANUP_SCOPE)).toMatchObject(
      { attemptId: obligation.attemptId },
    )
  })

  it('explicitly retries a pending revocation and clears debt only after live state is false', async () => {
    const pendingHash = hashFor(93)
    const obligation = recordMigrationApprovalCleanupRequired(CLEANUP_SCOPE)
    recordMigrationApprovalCleanupRevocationHash(
      CLEANUP_SCOPE,
      '00000000-0000-4000-8000-000000000093',
      [obligation.attemptId],
      pendingHash,
    )
    getTransactionReceiptMock.mockRejectedValueOnce(
      new Error('pending receipt unavailable'),
    )

    const hashes = await revokeStandingTemporaryHcaAccess({
      wagmiConfig: WAGMI,
      publicClient: PUBLIC_CLIENT,
      signer: SIGNER,
      walletAddress: OWNER,
      hcaAddress: HCA,
    })

    expect(getTransactionReceiptMock).toHaveBeenCalledWith({
      hash: pendingHash,
    })
    expect(hashes).toEqual([hashFor(1)])
    expect(revocationCalls()).toHaveLength(1)
    expect(readContractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'isApprovedForAll',
        args: [OWNER, HCA],
        blockNumber: 123n,
      }),
    )
    expect(loadMigrationApprovalCleanupObligation(CLEANUP_SCOPE)).toBeNull()
  })

  it('revokes a pending grant from durable debt even while the RPC reports false', async () => {
    const obligation = recordMigrationApprovalCleanupGrantAttempt(CLEANUP_SCOPE)
    recordMigrationApprovalCleanupGrantHash(
      CLEANUP_SCOPE,
      obligation.attemptId,
      hashFor(90),
    )

    const hashes = await revokeStandingTemporaryHcaAccess({
      wagmiConfig: WAGMI,
      publicClient: PUBLIC_CLIENT,
      signer: SIGNER,
      walletAddress: OWNER,
      hcaAddress: HCA,
    })

    expect(hashes).toHaveLength(1)
    expect(revocationCalls()).toHaveLength(1)
    expect(loadMigrationApprovalCleanupObligation(CLEANUP_SCOPE)).toBeNull()
  })

  it('does not revoke while an unresolved grant prompt can land afterward', async () => {
    const prompt = recordMigrationApprovalCleanupGrantAttempt(CLEANUP_SCOPE)

    await expect(
      revokeStandingTemporaryHcaAccess({
        wagmiConfig: WAGMI,
        publicClient: PUBLIC_CLIENT,
        signer: SIGNER,
        walletAddress: OWNER,
        hcaAddress: HCA,
      }),
    ).rejects.toMatchObject({ name: 'MigrationCleanupError' })

    expect(revocationCalls()).toHaveLength(0)
    expect(
      loadMigrationApprovalCleanupJournal(CLEANUP_SCOPE).obligations,
    ).toEqual([
      expect.objectContaining({
        attemptId: prompt.attemptId,
        state: 'prompt-pending',
      }),
    ])

    recordMigrationApprovalCleanupGrantHash(
      CLEANUP_SCOPE,
      prompt.attemptId,
      hashFor(94),
    )

    expect(
      loadMigrationApprovalCleanupJournal(CLEANUP_SCOPE).obligations,
    ).toEqual([
      expect.objectContaining({
        attemptId: prompt.attemptId,
        state: 'grant-submitted',
        grantHash: hashFor(94),
      }),
    ])

    // Once the original wallet request returns a hash, its ordering can be
    // fenced by the cleanup transaction.
    ethRegistryOperatorGranted = true
    const hashes = await revokeStandingTemporaryHcaAccess({
      wagmiConfig: WAGMI,
      publicClient: PUBLIC_CLIENT,
      signer: SIGNER,
      walletAddress: OWNER,
      hcaAddress: HCA,
    })

    expect(hashes).toEqual([hashFor(1)])
    expect(revocationCalls()).toHaveLength(1)
    expect(
      loadMigrationApprovalCleanupJournal(CLEANUP_SCOPE).obligations,
    ).toEqual([])
  })

  it('revokes a standing grant without any migration plan', async () => {
    ethRegistryOperatorGranted = true

    const hashes = await revokeStandingTemporaryHcaAccess({
      wagmiConfig: WAGMI,
      publicClient: PUBLIC_CLIENT,
      signer: SIGNER,
      walletAddress: OWNER,
      hcaAddress: HCA,
    })

    expect(hashes).toHaveLength(1)
    const revocations = revocationCalls()
    expect(revocations).toHaveLength(1)
    const request = (
      revocations[0]?.[0] as {
        request: { to: string; from: string; data: string }
      }
    ).request
    expect(request.from).toBe(OWNER)
    expect(request.to).toBe(V2_CONTRACTS.ETHRegistry)
    expect(request.data.toLowerCase()).toContain(HCA.slice(2).toLowerCase())
  })

  it('submits nothing when no grant is standing', async () => {
    const hashes = await revokeStandingTemporaryHcaAccess({
      wagmiConfig: WAGMI,
      publicClient: PUBLIC_CLIENT,
      signer: SIGNER,
      walletAddress: OWNER,
      hcaAddress: HCA,
    })

    expect(hashes).toEqual([])
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })
})
