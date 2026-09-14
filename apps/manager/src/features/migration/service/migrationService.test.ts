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

import type {
  AtomicMigrationNameExecution,
  BuildAtomicMigrationBatchesParams,
} from './buildAtomicMigrationBatches'
import type { MigrationPlan } from './buildMigrationPlan'
import type { ClassifiedName, CopyClassifiedName } from './classifyNames'
import { groupClassifiedNames } from './classifyNames'
import type { MigrationApproval } from './migrationApprovals'
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
const getTransactionReceiptMock = vi.fn()
const waitForReceiptMock = vi.fn()
const PUBLIC_CLIENT = {
  chain: { id: 11155111 },
  getCode: getCodeMock,
  estimateGas: estimateGasMock,
  readContract: readContractMock,
  getTransactionReceipt: getTransactionReceiptMock,
  waitForTransactionReceipt: waitForReceiptMock,
} as unknown as PublicClient

const APPROVAL: MigrationApproval = {
  kind: 'operator',
  id: 'base-registrar:hca',
  contractAddress: APPROVAL_CONTRACT,
  operatorAddress: HCA,
}
const TOKEN_APPROVAL: MigrationApproval = {
  kind: 'erc721-token',
  id: 'base-registrar:hca-token',
  contractAddress: APPROVAL_CONTRACT,
  operatorAddress: HCA,
  tokenId: 1n,
}
const WRAPPER_APPROVAL: MigrationApproval = {
  kind: 'operator',
  id: 'name-wrapper:hca',
  contractAddress: APPROVAL_CONTRACT,
  operatorAddress: HCA,
}
const MANAGER_APPROVAL: MigrationApproval = {
  kind: 'operator',
  id: 'eth-registry:hca',
  contractAddress: APPROVAL_CONTRACT,
  operatorAddress: HCA,
}

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
  mocks.startTransaction.mockImplementation(() => `tx-${nextTransaction++}`)
  const hashForTransaction = (txId: string) =>
    hashFor(Number.parseInt(txId.slice('tx-'.length), 10) + 1)
  mocks.waitForTransactionHash.mockImplementation((txId: string) =>
    Promise.resolve(hashForTransaction(txId)),
  )
  mocks.waitForTransaction.mockImplementation((txId: string) =>
    Promise.resolve({ hash: hashForTransaction(txId) }),
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
  readContractMock.mockImplementation(
    ({ functionName }: { functionName: string }) => {
      if (functionName === 'ownerOf') return Promise.resolve(OWNER)
      if (functionName === 'balanceOf') return Promise.resolve(1n)
      return Promise.resolve(true)
    },
  )
  getTransactionReceiptMock.mockResolvedValue({
    status: 'success',
    blockNumber: 123n,
  } as TransactionReceipt)
  waitForReceiptMock.mockResolvedValue({
    status: 'success',
    blockNumber: 123n,
  } as TransactionReceipt)
})

describe('executeMigration HCA orchestration', () => {
  it('describes migrate, copy, and mixed batches in user-facing terms', async () => {
    const migrateDescriptions = (
      await runExecute({ plan: planFor(['alice']) })
    ).progressEvents.map(({ description }) => description)
    expect(migrateDescriptions).toContain('Upgrading alice.eth')

    const copy = copyClassifiedFor()
    const copyDescriptions = (
      await runExecute({
        plan: planFromClassified([copy], [classifiedFor('alice'), copy]),
      })
    ).progressEvents.map(({ description }) => description)
    expect(copyDescriptions).toContain('Copying sub.alice.eth')

    const multipleMigrateDescriptions = (
      await runExecute({ plan: planFor(['alice', 'bob']) })
    ).progressEvents.map(({ description }) => description)
    expect(multipleMigrateDescriptions).toContain('Upgrading 2 names')

    const secondCopy = copyClassifiedFor({ label: 'other' })
    const multipleCopyDescriptions = (
      await runExecute({
        plan: planFromClassified(
          [copy, secondCopy],
          [classifiedFor('alice'), copy, secondCopy],
        ),
      })
    ).progressEvents.map(({ description }) => description)
    expect(multipleCopyDescriptions).toContain('Copying 2 names')

    const mixedDescriptions = (
      await runExecute({
        plan: planFromClassified(
          [classifiedFor('alice'), copy],
          [classifiedFor('alice'), copy],
        ),
      })
    ).progressEvents.map(({ description }) => description)
    expect(mixedDescriptions).toContain('Upgrading 1 name, copying 1')
  })

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

    const { progressEvents, result } = await runExecute({
      plan,
      reconcileBeforeSubmit: true,
    })

    expect(mocks.buildAtomicMigrationBatches).not.toHaveBeenCalled()
    expect(result).toMatchObject({ completed: 2, migrated: 1, copied: 1 })
    expect(progressEvents).toContainEqual(
      expect.objectContaining({
        description:
          'Picking up where you left off: 1 already upgraded, 1 already copied',
      }),
    )
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

    const { progressEvents, result } = await runExecute({ refreshAccount })

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
    expect(progressEvents.map(({ description }) => description)).toEqual(
      expect.arrayContaining(['Getting ready', 'Ready']),
    )
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
        description: 'Already set up',
      }),
    )
    expect(progressEvents.at(-1)).toMatchObject({
      currentStep: 2,
      totalSteps: 2,
      description: 'Batch confirmed',
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

  it('uses plain-language descriptions for every approval and cleanup kind', async () => {
    const approvals = [
      TOKEN_APPROVAL,
      APPROVAL,
      WRAPPER_APPROVAL,
      MANAGER_APPROVAL,
    ]
    mocks.planMigrationApprovals.mockReturnValue(approvals)
    const basePlan = planFor()
    const plan = {
      ...basePlan,
      preflight: {
        ...basePlan.preflight,
        migrationApprovals: approvals,
      },
    }

    const { progressEvents } = await runExecute({ plan })

    expect(progressEvents.map(({ description }) => description)).toEqual(
      expect.arrayContaining([
        'Getting permission to upgrade this name',
        'Getting permission to upgrade your names',
        'Getting permission to upgrade your wrapped names',
        'Getting permission to restore your managers',
        'Permission granted',
        'Removing temporary access',
        'Temporary access removed',
      ]),
    )
  })

  it('reports a planned approval that a retry finds already granted', async () => {
    mocks.planMigrationApprovals.mockReturnValue([])
    mocks.reconcileAtomicMigrationBatch.mockResolvedValueOnce({
      status: 'incomplete',
      verification: { batchIndex: 0, status: 'confirmed', results: [] },
      mismatches: [{ expectationId: 'alice.eth:name-owner' }],
    })
    const basePlan = planFor()
    const plan = {
      ...basePlan,
      preflight: {
        ...basePlan.preflight,
        migrationApprovals: [APPROVAL],
      },
    }

    const { progressEvents } = await runExecute({
      plan,
      reconcileBeforeSubmit: true,
    })

    expect(progressEvents).toContainEqual(
      expect.objectContaining({ description: 'Permission already granted' }),
    )
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

    const { progressEvents, result } = await runExecute({
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
    expect(progressEvents).toContainEqual(
      expect.objectContaining({
        description:
          'Picking up where you left off: alice.eth was already upgraded',
      }),
    )
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

    const { progressEvents, result } = await runExecute({
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
    expect(progressEvents).toContainEqual(
      expect.objectContaining({
        description: `Picking up where you left off: ${copy.domain.name} was already copied`,
      }),
    )
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
      description: 'Upgrade complete',
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

  it('revokes a temporary operator approval after a successful migration', async () => {
    mocks.planMigrationApprovals.mockReturnValue([MANAGER_APPROVAL])
    waitForReceiptMock
      .mockResolvedValueOnce({
        status: 'success',
        blockNumber: 121n,
      } as TransactionReceipt)
      .mockResolvedValueOnce({
        status: 'success',
        blockNumber: 122n,
      } as TransactionReceipt)

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
  })

  it('surfaces cleanup rejection for the dedicated recovery action', async () => {
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

    const error = await runExecute({ plan }).catch((cause: unknown) => cause)

    expect(error).toMatchObject({ name: 'MigrationCleanupError' })
    expect(mocks.verifyAtomicMigrationBatch).toHaveBeenCalledOnce()
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
      migrated: 0,
      copied: 0,
      completedOperations: [],
      txHashes: [],
      ineligible: [],
    })
    expect(getCodeMock).not.toHaveBeenCalled()
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })
})
