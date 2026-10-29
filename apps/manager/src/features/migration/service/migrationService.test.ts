import {
  buildHcaOwnerExecutionCall,
  getDestinationContracts,
} from '@ens-apps/smart-account'
import type { Call, Signer } from '@ens-apps/transaction-manager'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { Config as WagmiConfig } from '@wagmi/core'
import { Storage } from 'happy-dom'
import {
  type Address,
  encodeErrorResult,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  parseAbi,
  type TransactionReceipt,
} from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OPERATOR_APPROVAL_ABI } from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'

const mocks = vi.hoisted(() => ({
  buildHcaDeploymentCall: vi.fn(),
  verifyStandaloneHca: vi.fn(),
  startTransaction: vi.fn(),
  getAtomicBatchSupport: vi.fn(),
  getPersistedTransaction: vi.fn(),
  getArchivedTransactions: vi.fn(),
  waitForTransactionHash: vi.fn(),
  waitForTransaction: vi.fn(),
  buildAtomicMigrationBatches: vi.fn(),
  checkMigrationApprovals: vi.fn(),
  planMigrationApprovals: vi.fn(),
  buildMigrationApprovalCall: vi.fn(),
  checkResolverReadiness: vi.fn(),
  assertCopyMigrationReadiness: vi.fn(),
  assertCopySourcesFresh: vi.fn(),
  assertSupportedSubnameMigration: vi.fn(),
  reconcileAtomicMigrationBatch: vi.fn(),
  verifyAtomicMigrationBatch: vi.fn(),
  assertNoLiveSubregistryOverwrite: vi.fn(),
  assertLockedMigrationResolversUnchanged: vi.fn(),
  assertLockedResolverReplacementRecordSafety: vi.fn(),
  verifyMigrationRecoveryTransaction: vi.fn(),
  restoreMigrationCompletionCheckpoint: vi.fn(),
}))

vi.mock('./buildMigrationPlan', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./buildMigrationPlan')>()),
  assertLockedResolverReplacementRecordSafety:
    mocks.assertLockedResolverReplacementRecordSafety,
}))

vi.mock('@ens-apps/smart-account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ens-apps/smart-account')>()),
  buildHcaDeploymentCall: mocks.buildHcaDeploymentCall,
  verifyStandaloneHca: mocks.verifyStandaloneHca,
}))

vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: { startTransaction: mocks.startTransaction },
  getAtomicBatchSupport: mocks.getAtomicBatchSupport,
  getTransaction: mocks.getPersistedTransaction,
  getArchivedTransactions: mocks.getArchivedTransactions,
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

vi.mock('./migrationInvariants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./migrationInvariants')>()),
  checkDeterministicMigrationResolverReadiness: mocks.checkResolverReadiness,
  assertNoLiveSubregistryOverwrite: mocks.assertNoLiveSubregistryOverwrite,
  assertLockedMigrationResolversUnchanged:
    mocks.assertLockedMigrationResolversUnchanged,
}))

vi.mock('./copyMigrationReadiness', () => ({
  assertCopyMigrationReadiness: mocks.assertCopyMigrationReadiness,
  assertCopySourcesFresh: mocks.assertCopySourcesFresh,
}))

vi.mock('./subnameRecreation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./subnameRecreation')>()),
  assertSupportedSubnameMigration: mocks.assertSupportedSubnameMigration,
}))

vi.mock('./migrationCompletionCheckpoint', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./migrationCompletionCheckpoint')>()),
  verifyMigrationRecoveryTransaction: mocks.verifyMigrationRecoveryTransaction,
  restoreMigrationCompletionCheckpoint:
    mocks.restoreMigrationCompletionCheckpoint,
}))

vi.mock('./verifyAtomicMigrationBatch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./verifyAtomicMigrationBatch')>()),
  reconcileAtomicMigrationBatch: mocks.reconcileAtomicMigrationBatch,
  verifyAtomicMigrationBatch: mocks.verifyAtomicMigrationBatch,
}))

import type { V1Domain } from '@ens-apps/migration'
import type {
  AtomicMigrationBatch,
  AtomicMigrationNameExecution,
  BuildAtomicMigrationBatchesParams,
} from './buildAtomicMigrationBatches'
import { buildMigrationHelperCall } from './buildMigrationHelperCall'
import type { MigrationPlan } from './buildMigrationPlan'
import type { ClassifiedName, CopyClassifiedName } from './classifyNames'
import { groupClassifiedNames } from './classifyNames'
import { createMigrationData } from './encodeMigration'
import {
  type MigrationApproval,
  temporaryMigrationHcaApproval,
} from './migrationApprovals'
import {
  loadMigrationBatchJournal,
  loadMigrationRecoverySnapshot,
  loadPendingAtomicMigrationIntents,
  loadSubmittedAtomicMigrationBatches,
  type MigrationRecoverySnapshot,
  persistMigrationRecoverySnapshot,
  persistPendingAtomicMigrationIntent,
  persistSubmittedAtomicMigrationBatch,
  subscribeMigrationBatchJournal,
} from './migrationBatchJournal'
import {
  executeMigration,
  type MigrationProgress,
  type OnBatchComplete,
} from './migrationService'
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
const getBlockNumberMock = vi.fn()
const estimateGasMock = vi.fn()
const readContractMock = vi.fn()
const getTransactionReceiptMock = vi.fn()
const getTransactionMock = vi.fn()
const getTransactionCountMock = vi.fn()
const getBlockMock = vi.fn()
const waitForReceiptMock = vi.fn()
const PUBLIC_CLIENT = {
  chain: { id: 11155111 },
  getCode: getCodeMock,
  getBlockNumber: getBlockNumberMock,
  estimateGas: estimateGasMock,
  readContract: readContractMock,
  getTransactionReceipt: getTransactionReceiptMock,
  getTransaction: getTransactionMock,
  getTransactionCount: getTransactionCountMock,
  getBlock: getBlockMock,
  waitForTransactionReceipt: waitForReceiptMock,
} as unknown as PublicClient

const setHcaApprovalActive = () => {
  mocks.checkMigrationApprovals.mockResolvedValue({
    ethRegistryHcaApproved: true,
  })
  readContractMock.mockImplementation(
    ({ functionName }: { functionName: string }) => {
      if (functionName === 'ownerOf') return Promise.resolve(OWNER)
      if (functionName === 'balanceOf') return Promise.resolve(1n)
      return Promise.resolve(true)
    },
  )
}

const APPROVAL: MigrationApproval = {
  kind: 'operator',
  id: 'base-registrar:hca',
  contractAddress: APPROVAL_CONTRACT,
  operatorAddress: HCA,
}
const MANAGER_APPROVAL: MigrationApproval = {
  kind: 'operator',
  id: 'eth-registry:hca',
  contractAddress: APPROVAL_CONTRACT,
  operatorAddress: HCA,
}
const CLEANUP_APPROVAL = temporaryMigrationHcaApproval(HCA)

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
  registryController: null,
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
    registryController: null,
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
        walletExecutions: [],
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
              walletCall: null,
              estimatedGas: 500_000n,
              walletEstimatedGas: 0n,
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

const BULK_APPROVAL = {
  kind: 'operator' as const,
  id: 'base-registrar:hca' as const,
  contractAddress: V1_CONTRACTS.BaseRegistrar,
  operatorAddress: V2_CONTRACTS.MigrationHelper,
}
const BULK_REVIEW = {
  chainId: 11155111,
  owner: OWNER,
  contractAddress: BULK_APPROVAL.contractAddress,
  operatorAddress: BULK_APPROVAL.operatorAddress,
  names: ['alice.eth', 'bob.eth', 'carol.eth'],
}
const bulkPlan = (): MigrationPlan => ({
  ...planFor(['alice', 'bob', 'carol']),
  registrationApprovalStrategy: 'temporary-operator',
  preflight: {
    skipFetchProfilesPhase: true,
    registrationApprovalStrategy: 'temporary-operator',
    migrationApprovals: [BULK_APPROVAL],
    migrationCleanupApprovals: [BULK_APPROVAL],
  },
})

const mockBulkPermissionLifecycle = (
  initiallyActive = false,
  rejectInitialRevoke = false,
) => {
  let isActive = initiallyActive
  let shouldRejectRevoke = rejectInitialRevoke
  let nextTransaction = 0
  const transactions = new Map<
    Hex,
    {
      readonly from: Address
      readonly to: Address
      readonly input: Hex
      readonly value: bigint
      readonly chainId: number
      readonly nonce?: number
    }
  >()
  const hashesById = new Map<string, Hex>()
  mocks.startTransaction.mockImplementation(({ request }, _signer, options) => {
    if (
      request.to === BULK_APPROVAL.contractAddress &&
      request.data !== GRANT_DATA &&
      shouldRejectRevoke
    ) {
      throw Object.assign(new Error('User rejected cleanup'), {
        name: 'UserRejectedRequestError',
      })
    }
    const hash = hashFor(++nextTransaction)
    const transactionId = options.id ?? `tx-${nextTransaction}`
    hashesById.set(transactionId, hash)
    transactions.set(hash, {
      from: request.from,
      to: request.to,
      input: request.data,
      value: request.value,
      chainId: request.chainId,
      nonce: nextTransaction - 1,
    })
    if (request.to === BULK_APPROVAL.contractAddress)
      isActive = request.data === GRANT_DATA
    return transactionId
  })
  mocks.waitForTransactionHash.mockImplementation((id: string) =>
    Promise.resolve(hashesById.get(id)),
  )
  mocks.waitForTransaction.mockImplementation((id: string) =>
    Promise.resolve({ hash: hashesById.get(id) }),
  )
  getTransactionMock.mockImplementation(({ hash }: { readonly hash: Hex }) =>
    Promise.resolve(transactions.get(hash)),
  )
  getBlockNumberMock.mockResolvedValue(123n)
  readContractMock.mockImplementation(
    ({
      address,
      functionName,
    }: {
      readonly address: Address
      readonly functionName: string
    }) => {
      if (functionName === 'isApprovedForAll')
        return Promise.resolve(
          address === BULK_APPROVAL.contractAddress && isActive,
        )
      if (functionName === 'ownerOf') return Promise.resolve(OWNER)
      if (functionName === 'balanceOf') return Promise.resolve(1n)
      return Promise.resolve(true)
    },
  )
  return {
    isActive: () => isActive,
    transactions,
    allowRevocation: () => {
      shouldRejectRevoke = false
    },
  }
}

const persistBulkRecovery = (
  overrides: Partial<MigrationRecoverySnapshot> = {},
) => {
  const plan = bulkPlan()
  const operations = plan.registryContext.map(({ domain, action }) => ({
    name: domain.name,
    action,
  }))
  const snapshot: MigrationRecoverySnapshot = {
    registryDomains: plan.registryContext.map(({ domain }) => domain),
    registryOperations: operations,
    remainingOperations: operations,
    completedOperations: [],
    profiles: plan.profiles,
    ownedPermRes: plan.ownedPermRes,
    plannedApprovals: [{ id: 'base-registrar:hca' }],
    managerRestorationNames: [],
    registrationApprovalStrategy: 'temporary-operator',
    registrationApprovalReview: BULK_REVIEW,
    ...overrides,
  }
  persistMigrationRecoverySnapshot(
    { chainId: 11155111, owner: OWNER, hca: HCA },
    snapshot,
  )
  return snapshot
}

/** A batch whose profile text records the owner wallet has to write itself. */
const walletReplayBatch = (params: {
  readonly names: readonly string[]
  readonly outerCall: Call
  readonly walletCall?: Call
  readonly estimatedGas?: bigint
  readonly walletEstimatedGas?: bigint
}): AtomicMigrationBatch => {
  const nameExecutions: AtomicMigrationNameExecution[] = params.names.map(
    (name) => ({
      classified: classifiedFor(name.replace(/\.eth$/, '')),
      directRoute: null,
      migrationData: null,
      innerExecutions: [],
      walletExecutions: [
        {
          phase: 'profile-replay',
          name,
          names: [name],
          call: { to: RESOLVER, data: '0xreplay' as Hex, value: 0n },
          innerCalls: ['0xsets' as Hex],
        },
      ],
      verificationExpectations: [
        {
          id: `${name}:profile-text:0:email`,
          type: 'profile-text',
          name,
          node: hashFor(99),
          resolver: RESOLVER,
          key: 'email',
          value: `${name}@example.com`,
        },
      ],
    }),
  )
  return {
    index: 0,
    names: params.names,
    operations: params.names.map((name) => ({ name, action: 'migrate' })),
    nameExecutions,
    innerExecutions: [],
    outerCall: params.outerCall,
    walletCall: params.walletCall ?? {
      to: RESOLVER,
      data: '0xrecords' as Hex,
      value: 0n,
    },
    estimatedGas: params.estimatedGas ?? 500_000n,
    walletEstimatedGas: params.walletEstimatedGas ?? 120_000n,
    verificationExpectations: nameExecutions.flatMap(
      (execution) => execution.verificationExpectations,
    ),
  }
}

const runExecute = async (
  overrides: {
    plan?: MigrationPlan
    refreshAccount?: () => Promise<void>
    onBatchComplete?: OnBatchComplete
    reconcileBeforeSubmit?: boolean
    onProgress?: (progress: MigrationProgress) => void
    canRecreateSubnames?: () => boolean
    readonly submissionSignal?: AbortSignal
  } = {},
) => {
  const progressEvents: MigrationProgress[] = []
  const refreshAccount = overrides.refreshAccount ?? vi.fn()
  const submissionSignal =
    overrides.submissionSignal ?? new AbortController().signal
  const result = await executeMigration({
    plan: overrides.plan ?? planFor(),
    submissionGate: { signal: submissionSignal },
    wagmiConfig: WAGMI,
    publicClient: PUBLIC_CLIENT,
    signer: SIGNER,
    hcaClient: HCA_CLIENT,
    refreshAccount,
    onProgress: (progress) => {
      progressEvents.push(progress)
      overrides.onProgress?.(progress)
    },
    onBatchComplete: overrides.onBatchComplete,
    reconcileBeforeSubmit: overrides.reconcileBeforeSubmit,
    canRecreateSubnames: overrides.canRecreateSubnames,
  })
  return { progressEvents, refreshAccount, result }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertSupportedSubnameMigration.mockResolvedValue(undefined)
  vi.stubGlobal('localStorage', new Storage())

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
  mocks.getPersistedTransaction.mockResolvedValue(null)
  mocks.getArchivedTransactions.mockResolvedValue([])
  mocks.verifyMigrationRecoveryTransaction.mockResolvedValue('success')
  mocks.restoreMigrationCompletionCheckpoint.mockResolvedValue(null)
  mocks.buildMigrationApprovalCall.mockImplementation(
    (approval: MigrationApproval) => ({
      to: approval.contractAddress,
      data: GRANT_DATA,
      value: 0n,
    }),
  )
  mocks.assertNoLiveSubregistryOverwrite.mockResolvedValue(undefined)
  mocks.assertLockedMigrationResolversUnchanged.mockResolvedValue(undefined)
  mocks.assertLockedResolverReplacementRecordSafety.mockResolvedValue(undefined)
  mocks.checkResolverReadiness.mockResolvedValue({
    status: 'verified',
    resolver: RESOLVER,
    implementation: RESOLVER,
    hcaHasRootRoles: true,
    walletHasWildcardRoles: true,
    writer: 'hca',
  })
  mocks.assertCopyMigrationReadiness.mockResolvedValue(undefined)
  mocks.assertCopySourcesFresh.mockResolvedValue(undefined)
  mocks.buildAtomicMigrationBatches.mockImplementation(
    async ({
      hca,
      classified,
      estimateBatchGas,
    }: BuildAtomicMigrationBatchesParams) => {
      const names = classified.map(({ domain }) => domain.name)
      const outerCall = { to: hca, data: OUTER_DATA, value: 0n }
      const { outerGas } = await estimateBatchGas({
        call: outerCall,
        names,
        innerExecutions: [],
        walletCall: null,
        walletExecutions: [],
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
            walletCall: null,
            estimatedGas: outerGas,
            walletEstimatedGas: 0n,
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
  getBlockNumberMock.mockResolvedValue(123n)
  estimateGasMock.mockResolvedValue(500_000n)
  readContractMock.mockImplementation(
    ({ functionName }: { functionName: string }) => {
      if (functionName === 'ownerOf') return Promise.resolve(OWNER)
      if (functionName === 'balanceOf') return Promise.resolve(1n)
      if (functionName === 'isApprovedForAll') return Promise.resolve(false)
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
  it.each([
    { phase: 'grant', visibility: 'after-retry' },
    { phase: 'revoke', visibility: 'after-retry' },
    { phase: 'grant', visibility: 'after-confirmation' },
    { phase: 'revoke', visibility: 'after-confirmation' },
  ] as const)(
    'finishes when the $phase transaction becomes visible $visibility',
    async ({ phase, visibility }) => {
      vi.useFakeTimers()
      try {
        const permission = mockBulkPermissionLifecycle()
        const delayedHash = hashFor(phase === 'grant' ? 1 : 3)
        const expectedStatus =
          phase === 'grant' ? 'grant-pending' : 'revoke-pending'
        const expectedSubmission =
          visibility === 'after-retry'
            ? { nonce: phase === 'grant' ? 0n : 2n, blockNumber: 123n }
            : undefined
        const confirmed = new Set<Hex>()
        let hasMissedTransaction = false
        mocks.planMigrationApprovals.mockReturnValue([BULK_APPROVAL])
        getTransactionMock.mockImplementation(
          ({ hash }: { readonly hash: Hex }) => {
            if (
              hash === delayedHash &&
              !confirmed.has(hash) &&
              (visibility === 'after-confirmation' || !hasMissedTransaction)
            ) {
              hasMissedTransaction = true
              return Promise.reject(
                new Error('Transaction not found on this RPC yet'),
              )
            }
            return Promise.resolve(permission.transactions.get(hash))
          },
        )
        mocks.waitForTransaction.mockImplementation(async (id: string) => {
          const hash = await mocks.waitForTransactionHash(id)
          if (hash === delayedHash) {
            const approval = loadMigrationRecoverySnapshot({
              chainId: 11155111,
              owner: OWNER,
              hca: HCA,
            })?.temporaryRegistrationApproval
            expect(approval?.state).toMatchObject({
              status: expectedStatus,
              hash,
            })
            expect(approval?.submission).toEqual(expectedSubmission)
          }
          confirmed.add(hash)
          return { hash }
        })

        const execution = runExecute({ plan: bulkPlan() })
        const [{ result }] = await Promise.all([
          execution,
          vi.runAllTimersAsync(),
        ])

        expect(result.completed).toBe(3)
        expect(result.txHashes).toEqual([hashFor(1), hashFor(2), hashFor(3)])
        expect(permission.isActive()).toBe(false)
        expect(
          loadMigrationRecoverySnapshot({
            chainId: 11155111,
            owner: OWNER,
            hca: HCA,
          }),
        ).toBeNull()
        expect(
          mocks.startTransaction.mock.calls.map(([{ request }]) => request.to),
        ).toEqual([
          BULK_APPROVAL.contractAddress,
          HCA,
          BULK_APPROVAL.contractAddress,
        ])
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it('keeps journal write failures fatal after saving a submitted approval hash', async () => {
    mockBulkPermissionLifecycle()
    mocks.planMigrationApprovals.mockReturnValue([BULK_APPROVAL])
    const write = localStorage.setItem.bind(localStorage)
    const storage = vi
      .spyOn(localStorage, 'setItem')
      .mockImplementation((key, value) => {
        if (value.includes('"submission":'))
          throw new Error('Metadata journal quota exceeded')
        write(key, value)
      })
    try {
      await expect(runExecute({ plan: bulkPlan() })).rejects.toMatchObject({
        name: 'MigrationCleanupError',
      })
      expect(
        mocks.startTransaction.mock.calls.map(([{ request }]) => request.to),
      ).toEqual([BULK_APPROVAL.contractAddress, BULK_APPROVAL.contractAddress])
      expect(
        loadMigrationRecoverySnapshot({
          chainId: 11155111,
          owner: OWNER,
          hca: HCA,
        })?.temporaryRegistrationApproval?.state,
      ).toMatchObject({
        status: 'revoke-pending',
        hash: hashFor(2),
        grantHash: hashFor(1),
      })
    } finally {
      storage.mockRestore()
    }
  })

  it('can retry a bulk grant after a confirmed pre-submission chain mismatch', async () => {
    const permission = mockBulkPermissionLifecycle()
    mocks.planMigrationApprovals.mockReturnValue([BULK_APPROVAL])
    mocks.startTransaction.mockImplementationOnce(() => {
      throw Object.assign(new Error('not submitted'), {
        _tag: 'ChainIdMismatchError',
      })
    })
    await expect(runExecute({ plan: bulkPlan() })).rejects.toBeInstanceOf(Error)
    expect(
      loadMigrationRecoverySnapshot({
        chainId: 11155111,
        owner: OWNER,
        hca: HCA,
      })?.temporaryRegistrationApproval,
    ).toBeUndefined()
    mocks.reconcileAtomicMigrationBatch.mockResolvedValue({
      status: 'incomplete',
      verification: { batchIndex: 0, status: 'confirmed', results: [] },
      mismatches: [],
    })
    await runExecute({ plan: bulkPlan(), reconcileBeforeSubmit: true })
    expect(permission.isActive()).toBe(false)
  })

  it.each([undefined, hashFor(8)])(
    'recovers an archived grant without granting again (recorded hash: %s)',
    async (originalHash) => {
      const permission = mockBulkPermissionLifecycle(true)
      const replacementHash = hashFor(9)
      const transactionId = 'sped-up-grant'
      const request = {
        from: OWNER,
        to: BULK_APPROVAL.contractAddress,
        chainId: 11155111,
        data: GRANT_DATA,
        value: 0n,
      }
      permission.transactions.set(replacementHash, {
        ...request,
        input: GRANT_DATA,
      })
      persistBulkRecovery({
        temporaryRegistrationApproval: {
          contractAddress: BULK_APPROVAL.contractAddress,
          operatorAddress: BULK_APPROVAL.operatorAddress,
          state: { status: 'grant-pending', transactionId, hash: originalHash },
        },
      })
      mocks.getArchivedTransactions.mockResolvedValue([
        {
          id: transactionId,
          hash: replacementHash,
          state: 'success',
          context: { request },
          timestamp: 0,
          updatedAt: 0,
        },
      ])
      getTransactionReceiptMock.mockImplementation(({ hash }) =>
        hash === originalHash
          ? Promise.reject(new Error('dropped transaction'))
          : Promise.resolve({ status: 'success', blockNumber: 123n }),
      )
      mocks.planMigrationApprovals.mockReturnValue([])
      mocks.reconcileAtomicMigrationBatch.mockResolvedValue({
        status: 'incomplete',
        verification: { batchIndex: 0, status: 'confirmed', results: [] },
        mismatches: [],
      })
      await runExecute({ plan: bulkPlan(), reconcileBeforeSubmit: true })
      expect(
        mocks.startTransaction.mock.calls.map(([{ request }]) => request.to),
      ).toEqual([HCA, BULK_APPROVAL.contractAddress])
      expect(permission.isActive()).toBe(false)
    },
  )

  it.each([true, false])(
    'reconciles a mined replacement by nonce and validates its call: %s',
    async (isExpectedCall) => {
      const permission = mockBulkPermissionLifecycle(true)
      const originalHash = hashFor(8)
      const replacementHash = hashFor(9)
      const replacement = {
        hash: replacementHash,
        from: OWNER,
        to: BULK_APPROVAL.contractAddress,
        input: isExpectedCall ? GRANT_DATA : ('0xdead' as Hex),
        value: 0n,
        chainId: 11155111,
        nonce: 7,
      }
      permission.transactions.set(replacementHash, replacement)
      persistBulkRecovery({
        temporaryRegistrationApproval: {
          contractAddress: BULK_APPROVAL.contractAddress,
          operatorAddress: BULK_APPROVAL.operatorAddress,
          submission: { nonce: 7n, blockNumber: 100n },
          state: {
            status: 'grant-pending',
            transactionId: 'replaced-grant',
            hash: originalHash,
          },
        },
      })
      getTransactionCountMock.mockImplementation(
        ({ blockNumber }: { readonly blockNumber: bigint }) =>
          Promise.resolve(blockNumber < 120n ? 7 : 8),
      )
      getBlockMock.mockResolvedValue({ transactions: [replacement] })
      getTransactionReceiptMock.mockImplementation(({ hash }) =>
        hash === originalHash
          ? Promise.reject(new Error('dropped transaction'))
          : Promise.resolve({ status: 'success', blockNumber: 123n }),
      )
      mocks.planMigrationApprovals.mockReturnValue([])
      mocks.reconcileAtomicMigrationBatch.mockResolvedValue({
        status: 'incomplete',
        verification: { batchIndex: 0, status: 'confirmed', results: [] },
        mismatches: [],
      })
      const execution = runExecute({
        plan: bulkPlan(),
        reconcileBeforeSubmit: true,
      })
      if (isExpectedCall) {
        await execution
        expect(permission.isActive()).toBe(false)
        expect(
          mocks.startTransaction.mock.calls.map(([{ request }]) => request.to),
        ).toEqual([HCA, BULK_APPROVAL.contractAddress])
      } else {
        await expect(execution).rejects.toMatchObject({
          name: 'MigrationApprovalIndeterminateError',
        })
        expect(mocks.startTransaction).not.toHaveBeenCalled()
      }
      expect(getBlockMock).toHaveBeenCalledWith({
        blockNumber: 120n,
        includeTransactions: true,
      })
    },
  )

  it('retries a reverted revoke without applying its nonce to the original grant', async () => {
    const permission = mockBulkPermissionLifecycle(true)
    const grantHash = hashFor(8)
    const revokeHash = hashFor(9)
    permission.transactions.set(grantHash, {
      from: OWNER,
      to: BULK_APPROVAL.contractAddress,
      input: GRANT_DATA,
      chainId: 11155111,
      value: 0n,
      nonce: 1,
    })
    permission.transactions.set(revokeHash, {
      from: OWNER,
      to: BULK_APPROVAL.contractAddress,
      input: encodeFunctionData({
        abi: OPERATOR_APPROVAL_ABI,
        functionName: 'setApprovalForAll',
        args: [BULK_APPROVAL.operatorAddress, false],
      }),
      chainId: 11155111,
      value: 0n,
      nonce: 2,
    })
    persistBulkRecovery({
      temporaryRegistrationApproval: {
        contractAddress: BULK_APPROVAL.contractAddress,
        operatorAddress: BULK_APPROVAL.operatorAddress,
        submission: { nonce: 2n, blockNumber: 123n },
        state: {
          status: 'revoke-pending',
          transactionId: 'failed-revoke',
          grantHash,
          hash: revokeHash,
        },
      },
    })
    getTransactionReceiptMock.mockImplementation(({ hash }) =>
      Promise.resolve({
        status: hash === revokeHash ? 'reverted' : 'success',
        blockNumber: 123n,
      }),
    )
    mocks.planMigrationApprovals.mockReturnValue([])
    mocks.reconcileAtomicMigrationBatch.mockResolvedValue({
      status: 'incomplete',
      verification: { batchIndex: 0, status: 'confirmed', results: [] },
      mismatches: [],
    })
    await runExecute({ plan: bulkPlan(), reconcileBeforeSubmit: true })
    expect(permission.isActive()).toBe(false)
    expect(
      mocks.startTransaction.mock.calls.map(([{ request }]) => request.to),
    ).toEqual([HCA, BULK_APPROVAL.contractAddress])
  })

  it('keeps an uncertain bulk grant durable before the first migration request', async () => {
    mocks.planMigrationApprovals.mockReturnValue([BULK_APPROVAL])
    mocks.startTransaction.mockImplementation(({ request }) => {
      if (request.to === BULK_APPROVAL.contractAddress) {
        expect(
          loadMigrationRecoverySnapshot({
            chainId: 11155111,
            owner: OWNER,
            hca: HCA,
          }),
        ).toMatchObject({
          registrationApprovalStrategy: 'temporary-operator',
          registrationApprovalReview: BULK_REVIEW,
          temporaryRegistrationApproval: {
            contractAddress: BULK_APPROVAL.contractAddress,
            operatorAddress: BULK_APPROVAL.operatorAddress,
            state: { status: 'grant-pending' },
          },
        })
        throw new Error('wallet response lost')
      }
      return 'tx-0'
    })

    await expect(
      runExecute({
        plan: bulkPlan(),
      }),
    ).rejects.toBeInstanceOf(Error)

    expect(
      loadMigrationRecoverySnapshot({
        chainId: 11155111,
        owner: OWNER,
        hca: HCA,
      })?.temporaryRegistrationApproval?.state,
    ).toMatchObject({ status: 'grant-pending' })
    expect(mocks.startTransaction).toHaveBeenCalledOnce()
    expect(mocks.buildAtomicMigrationBatches).not.toHaveBeenCalled()

    mocks.startTransaction.mockClear()
    await expect(
      runExecute({
        plan: bulkPlan(),
        reconcileBeforeSubmit: true,
      }),
    ).rejects.toMatchObject({ name: 'MigrationApprovalIndeterminateError' })
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })

  it.each([
    {
      order: 'registration then registry',
      plannedCleanupApprovals: [BULK_APPROVAL, CLEANUP_APPROVAL],
    },
    {
      order: 'registry then registration',
      plannedCleanupApprovals: [CLEANUP_APPROVAL, BULK_APPROVAL],
    },
  ])(
    'submits active cleanup in preview order: $order',
    async ({ plannedCleanupApprovals }) => {
      const permission = mockBulkPermissionLifecycle()
      mocks.planMigrationApprovals.mockReturnValue([BULK_APPROVAL])
      mocks.checkMigrationApprovals.mockResolvedValue({
        ethRegistryHcaApproved: true,
      })
      readContractMock.mockImplementation(
        ({
          address,
          functionName,
        }: {
          readonly address: Address
          readonly functionName: string
        }) => {
          if (functionName === 'isApprovedForAll')
            return Promise.resolve(
              address === BULK_APPROVAL.contractAddress
                ? permission.isActive()
                : address === CLEANUP_APPROVAL.contractAddress,
            )
          if (functionName === 'ownerOf') return Promise.resolve(OWNER)
          if (functionName === 'balanceOf') return Promise.resolve(1n)
          return Promise.resolve(true)
        },
      )
      const plan = bulkPlan()

      await runExecute({
        plan: {
          ...plan,
          preflight: {
            ...plan.preflight,
            migrationCleanupApprovals: plannedCleanupApprovals,
          },
        },
      })

      expect(mocks.startTransaction).toHaveBeenCalledTimes(4)
      expect(
        mocks.startTransaction.mock.calls
          .slice(-2)
          .map(([{ request }]) => ({ to: request.to, data: request.data })),
      ).toEqual(
        plannedCleanupApprovals.map((approval) => ({
          to: approval.contractAddress,
          data: encodeFunctionData({
            abi: OPERATOR_APPROVAL_ABI,
            functionName: 'setApprovalForAll',
            args: [approval.operatorAddress, false],
          }),
        })),
      )
      expect(permission.isActive()).toBe(false)
    },
  )

  it('does not turn a rejected bulk grant into individual approvals', async () => {
    mocks.planMigrationApprovals.mockReturnValue([BULK_APPROVAL])
    mocks.startTransaction.mockImplementation(() => {
      throw Object.assign(new Error('User rejected request'), {
        name: 'UserRejectedRequestError',
      })
    })

    await expect(runExecute({ plan: bulkPlan() })).rejects.toMatchObject({
      name: 'MigrationUserRejectedError',
    })

    expect(mocks.startTransaction).toHaveBeenCalledOnce()
    expect(mocks.buildAtomicMigrationBatches).not.toHaveBeenCalled()
    expect(
      loadMigrationRecoverySnapshot({
        chainId: 11155111,
        owner: OWNER,
        hca: HCA,
      })?.temporaryRegistrationApproval,
    ).toBeUndefined()
  })

  it('does not open the bulk approval when durable recovery storage cannot be written', async () => {
    mocks.planMigrationApprovals.mockReturnValue([BULK_APPROVAL])
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage quota exceeded')
    })

    await expect(runExecute({ plan: bulkPlan() })).rejects.toThrow(
      'Storage quota exceeded',
    )
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })

  it('preserves another reviewed selection when a stale plan sees its temporary grant', async () => {
    const temporaryRegistrationApproval = {
      contractAddress: BULK_APPROVAL.contractAddress,
      operatorAddress: BULK_APPROVAL.operatorAddress,
      state: {
        status: 'grant-pending' as const,
        transactionId: 'another-selection',
      },
    }
    persistBulkRecovery({ temporaryRegistrationApproval })

    await expect(
      runExecute({ plan: planFor(['different']) }),
    ).rejects.toMatchObject({ name: 'MigrationPlanChangedError' })

    expect(mocks.startTransaction).not.toHaveBeenCalled()
    expect(
      loadMigrationRecoverySnapshot({
        chainId: 11155111,
        owner: OWNER,
        hca: HCA,
      })?.temporaryRegistrationApproval,
    ).toEqual(temporaryRegistrationApproval)
  })

  it('preserves a preexisting collection-wide registration permission', async () => {
    const permission = mockBulkPermissionLifecycle(true)
    mocks.checkMigrationApprovals.mockResolvedValue({
      baseRegistrarHcaApproved: true,
    })
    mocks.planMigrationApprovals.mockReturnValue([])

    const { result } = await runExecute()

    expect(result.completed).toBe(1)
    expect(
      mocks.startTransaction.mock.calls.map(([{ request }]) => request.to),
    ).toEqual([HCA])
    expect(permission.isActive()).toBe(true)
  })

  it('retries only cleanup after all names migrated and the bulk revoke was rejected', async () => {
    const permission = mockBulkPermissionLifecycle(false, true)
    mocks.planMigrationApprovals.mockReturnValue([BULK_APPROVAL])
    await expect(runExecute({ plan: bulkPlan() })).rejects.toMatchObject({
      name: 'MigrationCleanupError',
    })
    const recovery = loadMigrationRecoverySnapshot({
      chainId: 11155111,
      owner: OWNER,
      hca: HCA,
    })
    expect(recovery?.temporaryRegistrationApproval?.state).toEqual({
      status: 'granted',
      hash: hashFor(1),
    })
    expect(recovery?.remainingOperations).toEqual([])
    expect(recovery?.completedOperations).toEqual([
      { name: 'alice.eth', action: 'migrate' },
      { name: 'bob.eth', action: 'migrate' },
      { name: 'carol.eth', action: 'migrate' },
    ])
    permission.allowRevocation()
    const plan: MigrationPlan = {
      ...bulkPlan(),
      classified: [],
      groups: groupClassifiedNames([]),
      atomicBatches: [],
      requiresReconciliation: true,
      priorCompletedOperations: recovery?.completedOperations,
      registrationApprovalReview: recovery?.registrationApprovalReview,
      temporaryRegistrationApproval: recovery?.temporaryRegistrationApproval,
      preflight: {
        skipFetchProfilesPhase: true,
        migrationApprovals: [],
        migrationCleanupApprovals: [BULK_APPROVAL],
      },
    }
    const { result } = await runExecute({ plan })

    expect(result.completed).toBe(3)
    expect(permission.isActive()).toBe(false)
    expect(
      mocks.startTransaction.mock.calls.filter(
        ([{ request }]) => request.to === HCA,
      ),
    ).toHaveLength(1)
    expect(
      mocks.startTransaction.mock.calls.filter(
        ([{ request }]) => request.data === GRANT_DATA,
      ),
    ).toHaveLength(1)
  })

  it('retains a confirmed grant when the RPC head is behind its receipt', async () => {
    const permission = mockBulkPermissionLifecycle(true)
    const hash = hashFor(9)
    permission.transactions.set(hash, {
      from: OWNER,
      to: BULK_APPROVAL.contractAddress,
      chainId: 11155111,
      input: GRANT_DATA,
      value: 0n,
    })
    persistBulkRecovery({
      temporaryRegistrationApproval: {
        contractAddress: BULK_APPROVAL.contractAddress,
        operatorAddress: BULK_APPROVAL.operatorAddress,
        state: { status: 'granted', hash },
      },
    })
    getBlockNumberMock.mockResolvedValue(122n)

    await expect(
      runExecute({ plan: bulkPlan(), reconcileBeforeSubmit: true }),
    ).rejects.toMatchObject({ name: 'MigrationApprovalIndeterminateError' })

    expect(mocks.startTransaction).not.toHaveBeenCalled()
    expect(
      loadMigrationRecoverySnapshot({
        chainId: 11155111,
        owner: OWNER,
        hca: HCA,
      })?.temporaryRegistrationApproval?.state,
    ).toEqual({ status: 'granted', hash })
  })

  it.each([
    'success',
    'reverted',
    'pending-then-success',
    'success-with-wrong-profile',
  ] as const)(
    'reconciles a %s earlier-helper migration before requiring fresh consent',
    async (status) => {
      const permission = mockBulkPermissionLifecycle(true)
      const grantHash = hashFor(9)
      const submissionHash = hashFor(10)
      const previousHelper =
        '0x0000000000000000000000000000000000000099' as Address
      const temporaryRegistrationApproval = {
        contractAddress: BULK_APPROVAL.contractAddress,
        operatorAddress: previousHelper,
        state: { status: 'granted' as const, hash: grantHash },
      }
      const registrationApprovalReview = {
        ...BULK_REVIEW,
        operatorAddress: previousHelper,
      }
      const recovery = persistBulkRecovery({
        registrationApprovalReview,
        temporaryRegistrationApproval,
      })
      permission.transactions.set(grantHash, {
        from: OWNER,
        to: BULK_APPROVAL.contractAddress,
        chainId: 11155111,
        input: GRANT_DATA,
        value: 0n,
      })
      persistSubmittedAtomicMigrationBatch(
        { chainId: 11155111, owner: OWNER, hca: HCA },
        {
          intentId: 'earlier-helper-batch',
          hash: submissionHash,
          names: ['alice.eth'],
          operations: [{ name: 'alice.eth', action: 'migrate' }],
        },
      )
      mocks.verifyMigrationRecoveryTransaction.mockResolvedValue(
        status === 'reverted' ? 'reverted' : 'success',
      )
      const plan: MigrationPlan = {
        ...bulkPlan(),
        classified: [],
        groups: groupClassifiedNames([]),
        atomicBatches: [],
        requiresReconciliation: true,
        requiresFreshPreviewAfterCleanup: true,
        temporaryRegistrationApproval,
        registrationApprovalReview,
        preflight: {
          skipFetchProfilesPhase: true,
          migrationApprovals: [],
          migrationCleanupApprovals: [
            { ...BULK_APPROVAL, operatorAddress: previousHelper },
          ],
        },
      }

      if (status === 'pending-then-success') {
        mocks.verifyMigrationRecoveryTransaction.mockRejectedValueOnce(
          new Error('Receipt is still pending'),
        )
        await expect(runExecute({ plan })).rejects.toMatchObject({
          name: 'MigrationApprovalIndeterminateError',
        })
        const unresolved = loadMigrationBatchJournal({
          chainId: 11155111,
          owner: OWNER,
          hca: HCA,
        })
        expect(unresolved.submitted.map(({ hash }) => hash)).toEqual([
          submissionHash,
        ])
        expect(unresolved.recovery?.remainingOperations).toEqual(
          recovery.remainingOperations,
        )
        expect(unresolved.recovery?.registrationApprovalReview).toEqual(
          registrationApprovalReview,
        )
      }
      await expect(runExecute({ plan })).rejects.toMatchObject({
        name: 'MigrationPlanChangedError',
      })

      expect(mocks.verifyMigrationRecoveryTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionHash: submissionHash,
          migrationHelper: previousHelper,
        }),
      )
      const updated = loadMigrationBatchJournal({
        chainId: 11155111,
        owner: OWNER,
        hca: HCA,
      })
      expect(
        updated.submitted.map(({ hash, migrationHelper }) => ({
          hash,
          migrationHelper,
        })),
      ).toEqual(
        status === 'reverted'
          ? []
          : [{ hash: submissionHash, migrationHelper: previousHelper }],
      )
      expect(updated.recovery?.registrationApprovalReview).toBeUndefined()
      expect(updated.recovery?.temporaryRegistrationApproval).toBeUndefined()
      expect(updated.recovery?.profiles).toEqual(recovery.profiles)
      expect(updated.recovery?.completedOperations).toEqual([])
      expect(
        updated.recovery?.remainingOperations.map(({ name }) => name),
      ).toEqual(['alice.eth', 'bob.eth', 'carol.eth'])
      expect(permission.isActive()).toBe(false)
      if (status !== 'success' && status !== 'success-with-wrong-profile')
        return

      const profileExpectation = {
        id: 'alice.eth:profile-text:url',
        type: 'profile-text' as const,
        name: 'alice.eth',
        node: hashFor(88),
        resolver: RESOLVER,
        key: 'url',
        value: 'https://frozen.example',
      }
      const freshPlan = bulkPlan()
      const resumedPlan = {
        ...freshPlan,
        atomicBatches: freshPlan.atomicBatches.map((batch) => ({
          ...batch,
          nameExecutions: batch.nameExecutions.map((execution) =>
            execution.classified.domain.name === 'alice.eth'
              ? {
                  ...execution,
                  verificationExpectations: [
                    ...execution.verificationExpectations,
                    profileExpectation,
                  ],
                }
              : execution,
          ),
        })),
      }
      mocks.startTransaction.mockClear()
      mocks.planMigrationApprovals.mockReturnValue([BULK_APPROVAL])
      mocks.reconcileAtomicMigrationBatch.mockResolvedValue({
        status: 'incomplete',
        verification: { batchIndex: 0, status: 'confirmed', results: [] },
        mismatches: [],
      })
      if (status === 'success-with-wrong-profile') {
        mocks.verifyAtomicMigrationBatch.mockRejectedValueOnce(
          new Error('The frozen URL record does not match'),
        )
        await expect(
          runExecute({ plan: resumedPlan, reconcileBeforeSubmit: true }),
        ).rejects.toMatchObject({
          name: 'MigrationError',
          cause: { name: 'SubmittedAtomicMigrationVerificationError' },
        })
        expect(mocks.startTransaction).not.toHaveBeenCalled()
        expect(
          loadSubmittedAtomicMigrationBatches({
            chainId: 11155111,
            owner: OWNER,
            hca: HCA,
          }).map(({ hash }) => hash),
        ).toEqual([submissionHash])
      } else {
        const { result } = await runExecute({
          plan: resumedPlan,
          reconcileBeforeSubmit: true,
        })
        expect(result.completed).toBe(3)
        expect(
          mocks.buildAtomicMigrationBatches.mock.calls.map(([input]) =>
            input.classified.map(({ domain }: ClassifiedName) => domain.name),
          ),
        ).toEqual([['bob.eth', 'carol.eth']])
      }
      expect(mocks.verifyAtomicMigrationBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          batch: expect.objectContaining({
            verificationExpectations: expect.arrayContaining([
              profileExpectation,
            ]),
          }),
          blockNumber: 123n,
        }),
      )
    },
  )

  it.each([false, true])(
    'keeps terminal historical evidence unless a current checkpoint verifies (verified: %s)',
    async (hasCurrentProof) => {
      const operations = persistBulkRecovery().registryOperations
      persistSubmittedAtomicMigrationBatch(
        { chainId: 11155111, owner: OWNER, hca: HCA },
        {
          intentId: 'old-terminal-batch',
          hash: hashFor(10),
          migrationHelper: '0x0000000000000000000000000000000000000099',
          names: operations.map(({ name }) => name),
          operations,
        },
      )
      mocks.restoreMigrationCompletionCheckpoint.mockResolvedValue(
        hasCurrentProof ? operations[0] : null,
      )
      const plan = {
        ...bulkPlan(),
        preflight: {
          skipFetchProfilesPhase: true,
          migrationApprovals: [],
          migrationCleanupApprovals: [],
        },
      }
      if (hasCurrentProof) {
        const { result } = await runExecute({
          plan,
          reconcileBeforeSubmit: true,
        })
        expect(result.completed).toBe(3)
        expect(
          loadMigrationBatchJournal({
            chainId: 11155111,
            owner: OWNER,
            hca: HCA,
          }).submitted,
        ).toEqual([])
      } else {
        await expect(
          runExecute({ plan, reconcileBeforeSubmit: true }),
        ).rejects.toMatchObject({ name: 'MigrationHistoricalDeploymentError' })
        expect(
          loadMigrationBatchJournal({
            chainId: 11155111,
            owner: OWNER,
            hca: HCA,
          }).submitted.map(({ hash }) => hash),
        ).toEqual([hashFor(10)])
      }
      expect(mocks.verifyAtomicMigrationBatch).toHaveBeenCalledOnce()
      expect(mocks.restoreMigrationCompletionCheckpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: { chainId: 11155111, owner: OWNER, hca: HCA },
        }),
      )
      expect(mocks.startTransaction).not.toHaveBeenCalled()
    },
  )

  it('durably retains the full tree while advancing only verified gas-split nodes', async () => {
    const parent = classifiedFor('alice')
    const copy = copyClassifiedFor()
    const plan = planFromClassified([parent, copy], [parent, copy])
    mocks.buildAtomicMigrationBatches.mockImplementation(
      async ({
        hca,
        classified,
        estimateBatchGas,
      }: BuildAtomicMigrationBatchesParams) => {
        const first = classified.slice(0, 1)
        const names = first.map(({ domain }) => domain.name)
        const outerCall = { to: hca, data: OUTER_DATA, value: 0n }
        const { outerGas } = await estimateBatchGas({
          call: outerCall,
          names,
          innerExecutions: [],
          walletCall: null,
          walletExecutions: [],
        })
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
              walletCall: null,
              estimatedGas: outerGas,
              walletEstimatedGas: 0n,
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

  it('does not submit a second durable copy gas-split batch after the submission gate is aborted', async () => {
    const parent = classifiedFor('alice')
    const copy = copyClassifiedFor()
    const plan = planFromClassified([parent, copy], [parent, copy])
    mocks.buildAtomicMigrationBatches.mockImplementation(
      async ({
        hca,
        classified,
        estimateBatchGas,
      }: BuildAtomicMigrationBatchesParams) => {
        const first = classified.slice(0, 1)
        const names = first.map(({ domain }) => domain.name)
        const outerCall = { to: hca, data: OUTER_DATA, value: 0n }
        const { outerGas } = await estimateBatchGas({
          call: outerCall,
          names,
          innerExecutions: [],
          walletCall: null,
          walletExecutions: [],
        })
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
              walletCall: null,
              estimatedGas: outerGas,
              walletEstimatedGas: 0n,
              verificationExpectations: [],
            },
          ],
        }
      },
    )
    let resolveFirstTransaction!: (result: { readonly hash: Hex }) => void
    const firstTransaction = new Promise<{ readonly hash: Hex }>((resolve) => {
      resolveFirstTransaction = resolve
    })
    let resolveFirstTransactionHeld!: () => void
    const firstTransactionHeld = new Promise<void>((resolve) => {
      resolveFirstTransactionHeld = resolve
    })
    mocks.waitForTransaction.mockImplementationOnce(() => {
      resolveFirstTransactionHeld()
      return firstTransaction
    })
    const controller = new AbortController()
    const scope = { chainId: 11155111, owner: OWNER, hca: HCA }
    let hasPersistedSecondBatchIntent = false
    const unsubscribe = subscribeMigrationBatchJournal(() => {
      if (
        loadPendingAtomicMigrationIntents(scope).some(({ names }) =>
          names.includes(copy.domain.name),
        )
      ) {
        hasPersistedSecondBatchIntent = true
      }
    })

    const observedExecution = runExecute({
      plan,
      submissionSignal: controller.signal,
    }).then(
      () => undefined,
      () => undefined,
    )
    await firstTransactionHeld
    controller.abort()
    resolveFirstTransaction({ hash: hashFor(1) })
    await observedExecution
    unsubscribe()

    const recovery = loadMigrationRecoverySnapshot(scope)
    expect(mocks.startTransaction).toHaveBeenCalledOnce()
    expect(hasPersistedSecondBatchIntent).toBe(false)
    expect(
      mocks.verifyAtomicMigrationBatch.mock.calls[0]?.[0].batch.names,
    ).toEqual([parent.domain.name])
    expect(recovery).toMatchObject({
      completedOperations: [{ name: parent.domain.name, action: 'migrate' }],
      remainingOperations: [{ name: copy.domain.name, action: 'copy' }],
    })
  })

  // Leaves the page once the final batch is in the wallet, so the batch lands
  // but cleanup reaches a closed gate.
  const leaveDuringFinalBatch = (): AbortController => {
    const controller = new AbortController()
    let nextTransaction = mocks.startTransaction.mock.calls.length
    mocks.startTransaction.mockImplementation(
      ({ request }: { readonly request: { readonly data: Hex } }) => {
        if (request.data === OUTER_DATA) controller.abort()
        return `tx-${nextTransaction++}`
      },
    )
    return controller
  }

  const submittedKinds = () =>
    mocks.startTransaction.mock.calls.map((call) => {
      const [{ request }] = call as [
        { readonly request: { readonly to: Address; readonly data: Hex } },
      ]
      if (request.data === OUTER_DATA) return 'batch'
      if (request.to === V2_CONTRACTS.ETHRegistry) return 'cleanup'
      return 'other'
    })

  it('finishes only cleanup on return after leaving during the final copy batch', async () => {
    setHcaApprovalActive()
    const parent = classifiedFor('alice')
    const copy = copyClassifiedFor()
    const basePlan = planFromClassified([parent, copy], [parent, copy])
    const plan = {
      ...basePlan,
      preflight: {
        ...basePlan.preflight,
        migrationCleanupApprovals: [CLEANUP_APPROVAL],
      },
    }
    const scope = { chainId: 11155111, owner: OWNER, hca: HCA }
    const controller = leaveDuringFinalBatch()

    await expect(
      runExecute({ plan, submissionSignal: controller.signal }),
    ).rejects.toBeDefined()
    expect(submittedKinds()).toEqual(['batch'])
    expect(loadSubmittedAtomicMigrationBatches(scope)).toEqual([
      expect.objectContaining({
        operations: [
          { name: parent.domain.name, action: 'migrate' },
          { name: copy.domain.name, action: 'copy' },
        ],
      }),
    ])

    mocks.buildAtomicMigrationBatches.mockClear()
    const { result } = await runExecute({ plan, reconcileBeforeSubmit: true })

    expect(mocks.buildAtomicMigrationBatches).not.toHaveBeenCalled()
    expect(submittedKinds()).toEqual(['batch', 'cleanup'])
    expect(result).toMatchObject({ completed: 2, migrated: 1, copied: 1 })
    expect(loadMigrationRecoverySnapshot(scope)).toBeNull()
  })

  it('leaves nothing to resubmit after leaving during a direct-only final batch', async () => {
    setHcaApprovalActive()
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationCleanupApprovals: [CLEANUP_APPROVAL],
      },
    }
    const scope = { chainId: 11155111, owner: OWNER, hca: HCA }
    const controller = leaveDuringFinalBatch()

    await expect(
      runExecute({ plan, submissionSignal: controller.signal }),
    ).rejects.toBeDefined()

    // The temporary access stays for the permissions page to revoke; the
    // journal holds no operation that /upgrade could submit again.
    expect(submittedKinds()).toEqual(['batch'])
    expect(mocks.verifyAtomicMigrationBatch).toHaveBeenCalledOnce()
    expect(
      loadMigrationRecoverySnapshot(scope)?.remainingOperations ?? [],
    ).toEqual([])
    expect(loadPendingAtomicMigrationIntents(scope)).toEqual([])
    expect(loadSubmittedAtomicMigrationBatches(scope)).toEqual([])
  })

  it('retains the final receipt through cleanup and resumes without duplicate registration', async () => {
    setHcaApprovalActive()
    const parent = classifiedFor('alice')
    const copy = copyClassifiedFor()
    const basePlan = planFromClassified([parent, copy], [parent, copy])
    const plan = {
      ...basePlan,
      preflight: {
        ...basePlan.preflight,
        migrationApprovals: [MANAGER_APPROVAL],
        migrationCleanupApprovals: [CLEANUP_APPROVAL],
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

    expect(mocks.assertCopyMigrationReadiness).toHaveBeenCalledTimes(3)
    expect(
      mocks.assertCopyMigrationReadiness.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.buildAtomicMigrationBatches.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    )
    expect(
      mocks.assertCopyMigrationReadiness.mock.invocationCallOrder[2],
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
          roleGrants: [],
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

  it('reports wallet submission before mining without completing the step early', async () => {
    const onProgress = vi.fn()
    mocks.waitForTransactionHash.mockImplementationOnce(async () => {
      expect(onProgress).toHaveBeenLastCalledWith(
        expect.objectContaining({ currentStep: 0, txHash: undefined }),
      )
      expect(
        onProgress.mock.lastCall?.[0].isAwaitingConfirmation,
      ).toBeUndefined()
      return hashFor(1)
    })
    mocks.waitForTransaction.mockImplementationOnce(async () => {
      expect(onProgress).toHaveBeenLastCalledWith(
        expect.objectContaining({
          currentStep: 0,
          txHash: hashFor(1),
          isAwaitingConfirmation: true,
        }),
      )
      return { hash: hashFor(1) }
    })

    const { progressEvents } = await runExecute({ onProgress })
    expect(progressEvents.at(-1)).toMatchObject({ currentStep: 1 })
    expect(progressEvents.at(-1)?.isAwaitingConfirmation).toBeUndefined()
  })

  it('replays records from the wallet before submitting the atomic batch', async () => {
    const plan = planFor()
    const walletCall = { to: RESOLVER, data: '0xrecords' as Hex, value: 0n }
    mocks.reconcileAtomicMigrationBatch.mockResolvedValueOnce({
      status: 'incomplete',
      verification: { batchIndex: 0, status: 'confirmed', results: [] },
      mismatches: [],
    })
    mocks.buildAtomicMigrationBatches.mockImplementation(
      async ({ hca, classified }: BuildAtomicMigrationBatchesParams) => {
        const names = classified.map(({ domain }) => domain.name)
        return {
          resolver: RESOLVER,
          batches: [
            walletReplayBatch({
              names,
              outerCall: { to: hca, data: OUTER_DATA, value: 0n },
              walletCall,
            }),
          ],
        }
      },
    )

    await runExecute({ plan })

    const submitted = mocks.startTransaction.mock.calls.map((call) => {
      const [request] = call as [
        { request: { to: Address; data: Hex; gas?: bigint } },
      ]
      return request.request
    })
    const walletIndex = submitted.findIndex(
      ({ to, data }: { to: Address; data: Hex }) =>
        to === RESOLVER && data === walletCall.data,
    )
    const outerIndex = submitted.findIndex(
      ({ to, data }: { to: Address; data: Hex }) =>
        to === HCA && data === OUTER_DATA,
    )
    expect(walletIndex).toBeGreaterThanOrEqual(0)
    // A failed replay must leave the names unmigrated, so it goes first.
    expect(walletIndex).toBeLessThan(outerIndex)
    expect(submitted[walletIndex]).toMatchObject({
      from: OWNER,
      gas: 132_000n,
    })
  })

  it('skips the replay when its records already landed on the resolver', async () => {
    mocks.reconcileAtomicMigrationBatch.mockResolvedValueOnce({
      status: 'complete',
      verification: { batchIndex: 0, status: 'confirmed', results: [] },
    })
    mocks.buildAtomicMigrationBatches.mockImplementation(
      async ({ hca, classified }: BuildAtomicMigrationBatchesParams) => ({
        resolver: RESOLVER,
        batches: [
          walletReplayBatch({
            names: classified.map(({ domain }) => domain.name),
            outerCall: { to: hca, data: OUTER_DATA, value: 0n },
          }),
        ],
      }),
    )

    await runExecute({ plan: planFor() })

    // Only the batch went out; the replay was recognised as already applied.
    const submitted = mocks.startTransaction.mock.calls.map((call) => {
      const [request] = call as [{ request: { to: Address } }]
      return request.request
    })
    expect(submitted.some(({ to }: { to: Address }) => to === RESOLVER)).toBe(
      false,
    )
    expect(submitted.some(({ to }: { to: Address }) => to === HCA)).toBe(true)
    // The check is scoped to the profile record reads it can prove, not to
    // ownership/expiry expectations the replay never writes.
    const reconcileRequest = mocks.reconcileAtomicMigrationBatch.mock
      .calls[0]?.[0] as {
      readonly batch: {
        readonly verificationExpectations: readonly { readonly type: string }[]
      }
    }
    expect(
      reconcileRequest.batch.verificationExpectations.map(({ type }) => type),
    ).toEqual(['profile-text'])
  })

  it('stops the run when the replay state cannot be read', async () => {
    mocks.reconcileAtomicMigrationBatch.mockRejectedValueOnce(
      new AtomicMigrationBatchReconciliationIndeterminateError({
        message: 'records could not be read',
        batchIndex: 0,
        readFailures: [],
      }),
    )
    mocks.buildAtomicMigrationBatches.mockImplementation(
      async ({ hca, classified }: BuildAtomicMigrationBatchesParams) => ({
        resolver: RESOLVER,
        batches: [
          walletReplayBatch({
            names: classified.map(({ domain }) => domain.name),
            outerCall: { to: hca, data: OUTER_DATA, value: 0n },
          }),
        ],
      }),
    )

    await expect(runExecute({ plan: planFor() })).rejects.toThrow()

    // Nothing was submitted: an unreadable state must not turn into a guessed
    // replay, and the batch must not run behind it.
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })

  it('estimates the wallet replay as its own transaction', async () => {
    const walletCall = { to: RESOLVER, data: '0xrecords' as Hex, value: 0n }
    mocks.reconcileAtomicMigrationBatch.mockResolvedValueOnce({
      status: 'incomplete',
      verification: { batchIndex: 0, status: 'confirmed', results: [] },
      mismatches: [],
    })
    mocks.buildAtomicMigrationBatches.mockImplementation(
      async ({
        hca,
        classified,
        estimateBatchGas,
      }: BuildAtomicMigrationBatchesParams) => {
        const names = classified.map(({ domain }) => domain.name)
        const outerCall = { to: hca, data: OUTER_DATA, value: 0n }
        const gas = await estimateBatchGas({
          call: outerCall,
          names,
          innerExecutions: [],
          walletCall,
          walletExecutions: [],
        })
        return {
          resolver: RESOLVER,
          batches: [
            walletReplayBatch({
              names,
              outerCall,
              walletCall,
              estimatedGas: gas.outerGas,
              walletEstimatedGas: gas.walletGas,
            }),
          ],
        }
      },
    )

    await runExecute({ plan: planFor() })

    expect(estimateGasMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: RESOLVER, data: walletCall.data }),
    )
    const submitted = mocks.startTransaction.mock.calls.map((call) => {
      const [request] = call as [
        { request: { to: Address; data: Hex; gas?: bigint } },
      ]
      return request.request
    })
    expect(submitted).toContainEqual(
      expect.objectContaining({
        to: RESOLVER,
        data: walletCall.data,
        gas: 550_000n,
      }),
    )
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
          gas: 550_000n,
        },
      },
      SIGNER,
      expect.objectContaining({ publicClient: PUBLIC_CLIENT, retryCount: 0 }),
    )
  })

  it.each([
    [500_001n, 550_002n],
    [15_000_000n, 16_500_000n],
  ])(
    'submits the live estimate %s with bounded gas headroom',
    async (estimate, gas) => {
      estimateGasMock.mockResolvedValueOnce(estimate)
      await runExecute()
      expect(mocks.startTransaction.mock.calls[0]?.[0].request.gas).toBe(gas)
      expect(gas).toBeLessThan(16_777_216n)
      expect(mocks.buildAtomicMigrationBatches).toHaveBeenCalledWith(
        expect.objectContaining({ maxOuterGas: 15_000_000n }),
      )
    },
  )

  it.each([0n, 15_000_001n, 21_354_459n])(
    'blocks an invalid batch gas estimate %s before opening the wallet',
    async (estimate) => {
      estimateGasMock.mockResolvedValueOnce(estimate)
      await expect(runExecute()).rejects.toThrow('supported gas budget')
      expect(mocks.startTransaction).not.toHaveBeenCalled()
    },
  )

  it('surfaces a submission gas-cap rejection without automatic wallet retries', async () => {
    mocks.waitForTransactionHash.mockRejectedValueOnce(
      new Error('transaction gas limit too high (cap: 16777216, tx: 21354459)'),
    )
    await expect(runExecute()).rejects.toMatchObject({
      name: 'MigrationError',
      cause: expect.objectContaining({
        message: expect.stringContaining('transaction gas limit too high'),
      }),
    })
    expect(mocks.startTransaction).toHaveBeenCalledOnce()
    expect(mocks.startTransaction.mock.calls[0]?.[2]).toMatchObject({
      retryCount: 0,
    })
    expect(mocks.verifyAtomicMigrationBatch).not.toHaveBeenCalled()
    expect(
      loadPendingAtomicMigrationIntents({
        chainId: 11155111,
        owner: OWNER,
        hca: HCA,
      }),
    ).toHaveLength(1)
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
    setHcaApprovalActive()
    mocks.planMigrationApprovals.mockReturnValue([APPROVAL, MANAGER_APPROVAL])
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [APPROVAL, MANAGER_APPROVAL],
        migrationCleanupApprovals: [CLEANUP_APPROVAL],
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
          roleGrants: [],
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
          roleGrants: [],
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

  it('requires a new preview when a grant becomes missing during recovery', async () => {
    mocks.reconcileAtomicMigrationBatch.mockResolvedValueOnce({
      status: 'incomplete',
      verification: { batchIndex: 0, status: 'confirmed', results: [] },
      mismatches: [{ expectationId: 'alice.eth:name-owner' }],
    })
    mocks.planMigrationApprovals.mockReturnValue([APPROVAL])

    const error = await runExecute({ reconcileBeforeSubmit: true }).catch(
      (cause: unknown) => cause,
    )

    expect(error).toMatchObject({
      name: 'MigrationPlanChangedError',
      plannedApprovalKeys: [],
      currentApprovalKeys: [
        `${APPROVAL.contractAddress.toLowerCase()}:${APPROVAL.operatorAddress.toLowerCase()}`,
      ],
    })
    expect(mocks.buildMigrationApprovalCall).not.toHaveBeenCalled()
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })

  it('skips a planned grant that became satisfied during recovery', async () => {
    mocks.reconcileAtomicMigrationBatch.mockResolvedValueOnce({
      status: 'incomplete',
      verification: { batchIndex: 0, status: 'confirmed', results: [] },
      mismatches: [{ expectationId: 'alice.eth:name-owner' }],
    })
    const plan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [APPROVAL],
      },
    }

    const { progressEvents } = await runExecute({
      plan,
      reconcileBeforeSubmit: true,
    })

    expect(mocks.buildMigrationApprovalCall).not.toHaveBeenCalled()
    expect(progressEvents).toContainEqual(
      expect.objectContaining({ description: 'Permission already granted' }),
    )
  })

  it('requires a new preview when temporary HCA access appears before submission', async () => {
    setHcaApprovalActive()
    const plan = {
      ...planFor(),
      hcaDeploymentRequired: true,
      stepDescriptors: [{ type: 'deploy-hca' as const }],
    }

    const error = await runExecute({ plan }).catch((cause: unknown) => cause)

    expect(error).toMatchObject({
      name: 'MigrationPlanChangedError',
      plannedApprovalKeys: [],
      currentApprovalKeys: [],
      plannedCleanupApprovalKeys: [],
      currentCleanupApprovalKeys: [
        `${V2_CONTRACTS.ETHRegistry.toLowerCase()}:${HCA.toLowerCase()}`,
      ],
    })
    expect(mocks.buildHcaDeploymentCall).not.toHaveBeenCalled()
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })

  it('checks cleanup after retry reconciliation completes every name', async () => {
    setHcaApprovalActive()
    persistPendingAtomicMigrationIntent(
      { chainId: 11155111, owner: OWNER, hca: HCA },
      {
        id: 'completed-before-cleanup-check',
        names: ['alice.eth'],
        operations: [{ name: 'alice.eth', action: 'migrate' }],
      },
    )

    const error = await runExecute({ reconcileBeforeSubmit: true }).catch(
      (cause: unknown) => cause,
    )

    expect(error).toMatchObject({
      name: 'MigrationPlanChangedError',
      plannedCleanupApprovalKeys: [],
      currentCleanupApprovalKeys: [
        `${V2_CONTRACTS.ETHRegistry.toLowerCase()}:${HCA.toLowerCase()}`,
      ],
    })
    expect(mocks.assertNoLiveSubregistryOverwrite).not.toHaveBeenCalled()
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })

  it('reconciles a mined bundled run and revokes planned access even if the wallet loses batching', async () => {
    setHcaApprovalActive()
    mocks.getAtomicBatchSupport.mockResolvedValue(false)
    persistPendingAtomicMigrationIntent(
      { chainId: 11155111, owner: OWNER, hca: HCA },
      {
        id: 'mined-bundle-cleanup',
        names: ['alice.eth'],
        operations: [{ name: 'alice.eth', action: 'migrate' }],
      },
    )
    const plan = {
      ...planFor(),
      canBatchAtomically: true,
      preflight: {
        ...planFor().preflight,
        migrationCleanupApprovals: [CLEANUP_APPROVAL],
      },
    }
    const { result } = await runExecute({ plan, reconcileBeforeSubmit: true })
    expect(result.completed).toBe(1)
    expect(mocks.buildAtomicMigrationBatches).not.toHaveBeenCalled()
    expect(mocks.buildHcaDeploymentCall).not.toHaveBeenCalled()
    expect(mocks.startTransaction).toHaveBeenCalledOnce()
    expect(mocks.startTransaction.mock.calls[0]?.[0]).toMatchObject({
      request: { to: V2_CONTRACTS.ETHRegistry },
    })
  })

  it('blocks changed source state and revokes previously planned temporary access', async () => {
    setHcaApprovalActive()
    const cause = new Error('The ENSv1 expiry changed after review')
    mocks.assertCopyMigrationReadiness.mockRejectedValueOnce(cause)
    const plan = {
      ...planFor(),
      hcaDeploymentRequired: true,
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [MANAGER_APPROVAL],
        migrationCleanupApprovals: [CLEANUP_APPROVAL],
      },
    }

    await expect(runExecute({ plan })).rejects.toMatchObject({
      name: 'MigrationSourceChangedError',
      cause,
    })
    expect(mocks.buildHcaDeploymentCall).not.toHaveBeenCalled()
    expect(mocks.startTransaction).toHaveBeenCalledOnce()
    expect(mocks.startTransaction.mock.calls[0]?.[0]).toMatchObject({
      request: { to: V2_CONTRACTS.ETHRegistry },
    })
  })

  it.each([
    { canBatchAtomically: false, hasFlagChangedAfterReadiness: false },
    { canBatchAtomically: false, hasFlagChangedAfterReadiness: true },
    { canBatchAtomically: true, hasFlagChangedAfterReadiness: false },
    { canBatchAtomically: true, hasFlagChangedAfterReadiness: true },
  ])(
    'blocks recreation when the rollout flag turns off (%j)',
    async ({ canBatchAtomically, hasFlagChangedAfterReadiness }) => {
      mocks.getAtomicBatchSupport.mockResolvedValue(true)
      const plan: MigrationPlan = {
        ...planFor(),
        canBatchAtomically,
        isSubnameRecreationEnabled: true,
        subnameRecreation: {
          version: 5,
          roots: ['alice.eth'],
          names: ['alice.eth'],
          blockNumber: '100',
          timestamp: '1000',
          blockHash: `0x${'11'.repeat(32)}`,
          chainId: 11155111,
          inventoryDigest: `0x${'22'.repeat(32)}`,
        },
      }
      const canRecreateSubnames = vi.fn(() => false)
      if (hasFlagChangedAfterReadiness)
        canRecreateSubnames.mockReturnValueOnce(true)
      await expect(runExecute({ plan, canRecreateSubnames })).rejects.toThrow(
        /not enabled/,
      )
      expect(mocks.startTransaction).not.toHaveBeenCalled()
    },
  )

  it('does not prompt for unplanned cleanup when an earlier read fails', async () => {
    setHcaApprovalActive()
    mocks.assertNoLiveSubregistryOverwrite.mockRejectedValueOnce(
      new Error('pointer read failed'),
    )

    const error = await runExecute().catch((cause: unknown) => cause)

    expect(error).toMatchObject({
      name: 'MigrationPlanChangedError',
      plannedCleanupApprovalKeys: [],
      currentCleanupApprovalKeys: [
        `${V2_CONTRACTS.ETHRegistry.toLowerCase()}:${HCA.toLowerCase()}`,
      ],
    })
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })

  it('blocks a name that gained a live subregistry before the first wallet prompt', async () => {
    mocks.assertNoLiveSubregistryOverwrite.mockRejectedValueOnce(
      Object.assign(new Error('live subregistry'), {
        name: 'MigrationContractInvariantError',
        invariant: 'live-subregistry-overwrite',
      }),
    )

    await expect(runExecute()).rejects.toMatchObject({
      invariant: 'live-subregistry-overwrite',
    })

    expect(mocks.assertNoLiveSubregistryOverwrite).toHaveBeenCalledWith({
      publicClient: PUBLIC_CLIENT,
      names: [expect.objectContaining({ label: 'alice' })],
    })
    expect(mocks.buildAtomicMigrationBatches).not.toHaveBeenCalled()
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    'refuses unsafe locked resolvers before setup or cleanup prompts (existing approval: %s)',
    async (existingApproval) => {
      getCodeMock.mockResolvedValue('0x')
      if (existingApproval) setHcaApprovalActive()
      const basePlan = planFor()
      const plan = {
        ...basePlan,
        hcaDeploymentRequired: true,
        preflight: {
          ...basePlan.preflight,
          migrationCleanupApprovals: existingApproval ? [CLEANUP_APPROVAL] : [],
        },
      }
      mocks.assertLockedMigrationResolversUnchanged.mockRejectedValueOnce(
        Object.assign(new Error('unsafe resolver'), {
          name: 'MigrationContractInvariantError',
          invariant: 'locked-resolver-record-control',
          ensName: 'alice.eth',
        }),
      )

      await expect(runExecute({ plan })).rejects.toMatchObject({
        invariant: 'locked-resolver-record-control',
        ensName: 'alice.eth',
      })
      expect(mocks.startTransaction).not.toHaveBeenCalled()
      expect(mocks.buildHcaDeploymentCall).not.toHaveBeenCalled()
      expect(mocks.buildAtomicMigrationBatches).not.toHaveBeenCalled()
    },
  )

  it('re-checks locked resolver records before each batch, including resumed ones', async () => {
    mocks.assertLockedResolverReplacementRecordSafety.mockRejectedValueOnce(
      Object.assign(new Error('records found'), {
        name: 'LockedResolverRecordSafetyError',
      }),
    )

    await expect(runExecute()).rejects.toMatchObject({
      name: 'LockedResolverRecordSafetyError',
    })

    expect(
      mocks.assertLockedResolverReplacementRecordSafety,
    ).toHaveBeenCalledWith(
      [expect.objectContaining({ label: 'alice' })],
      PUBLIC_CLIENT,
    )
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })

  it('re-checks the pointer on a retry, which never re-runs preflight', async () => {
    // A retry rebuilds the stored plan for whatever is left, so the only
    // subregistry verdict it would otherwise carry is the one from selection.
    mocks.reconcileAtomicMigrationBatch.mockResolvedValueOnce({
      status: 'incomplete',
      verification: {
        batchIndex: 0,
        status: 'confirmed',
        results: [{ expectationId: 'alice.eth:name-owner', satisfied: false }],
      },
      mismatches: [{ expectationId: 'alice.eth:name-owner' }],
    })
    mocks.assertNoLiveSubregistryOverwrite.mockRejectedValueOnce(
      Object.assign(new Error('live subregistry'), {
        name: 'MigrationContractInvariantError',
        invariant: 'live-subregistry-overwrite',
      }),
    )

    await expect(
      runExecute({ reconcileBeforeSubmit: true }),
    ).rejects.toMatchObject({ invariant: 'live-subregistry-overwrite' })

    expect(mocks.assertNoLiveSubregistryOverwrite).toHaveBeenCalledWith({
      publicClient: PUBLIC_CLIENT,
      names: [expect.objectContaining({ label: 'alice' })],
    })
    expect(mocks.startTransaction).not.toHaveBeenCalled()
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

  it('publishes recovery and attempt evidence together for a direct-only plan', async () => {
    const scope = { chainId: 11155111, owner: OWNER, hca: HCA }
    const observations: ReturnType<typeof loadMigrationBatchJournal>[] = []
    const unsubscribe = subscribeMigrationBatchJournal(() => {
      observations.push(loadMigrationBatchJournal(scope))
    })
    let resolveHash!: (hash: Hex) => void
    mocks.waitForTransactionHash.mockImplementationOnce(
      () =>
        new Promise<Hex>((resolve) => {
          resolveHash = resolve
        }),
    )

    const execution = runExecute()
    await vi.waitFor(() =>
      expect(mocks.startTransaction).toHaveBeenCalledOnce(),
    )
    const recovery = loadMigrationRecoverySnapshot(scope)
    resolveHash(hashFor(1))
    await execution
    unsubscribe()

    expect(recovery).toMatchObject({
      registryOperations: [{ name: 'alice.eth', action: 'migrate' }],
      remainingOperations: [{ name: 'alice.eth', action: 'migrate' }],
    })
    expect(
      observations.some(
        ({ recovery: snapshot, pending, submitted }) =>
          snapshot !== null &&
          snapshot.completedOperations.length === 0 &&
          pending.length === 0 &&
          submitted.length === 0,
      ),
    ).toBe(false)
    expect(
      observations.some(
        ({ recovery: snapshot, pending }) =>
          snapshot?.remainingOperations.length === 1 && pending.length === 1,
      ),
    ).toBe(true)
    expect(loadMigrationRecoverySnapshot(scope)).toBeNull()
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
    expect(
      loadMigrationRecoverySnapshot({
        chainId: 11155111,
        owner: OWNER,
        hca: HCA,
      }),
    ).toMatchObject({
      registryOperations: [{ name: 'alice.eth', action: 'migrate' }],
      remainingOperations: [{ name: 'alice.eth', action: 'migrate' }],
    })

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

    const { result, progressEvents } = await runExecute({
      plan,
      onBatchComplete,
      reconcileBeforeSubmit: true,
    })

    expect(progressEvents).toContainEqual(
      expect.objectContaining({
        description: `${copy.domain.name} was already copied`,
        isRecovering: true,
      }),
    )
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
    expect(mocks.assertCopyMigrationReadiness).toHaveBeenCalledTimes(3)
    expect(readContractMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'ownerOf' }),
    )
    expect(readContractMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'balanceOf' }),
    )
  })

  it('finishes progress at the planned total when retry reconciliation skips setup and submission', async () => {
    setHcaApprovalActive()
    const plan = {
      ...planFor(),
      hcaDeploymentRequired: true,
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [MANAGER_APPROVAL],
        migrationCleanupApprovals: [CLEANUP_APPROVAL],
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
          roleGrants: [],
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
    setHcaApprovalActive()
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
        migrationCleanupApprovals: [CLEANUP_APPROVAL],
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
    setHcaApprovalActive()
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
        migrationCleanupApprovals: [CLEANUP_APPROVAL],
      },
    }

    const error = await runExecute({ plan }).catch((cause: unknown) => cause)

    expect(error).toMatchObject({ name: 'MigrationCleanupError' })
    expect(mocks.verifyAtomicMigrationBatch).toHaveBeenCalledOnce()
  })

  it('revokes an approval left active after an aborted run on a fresh attempt', async () => {
    let isApprovedForAll = false
    let rejectFirstCleanup = true
    let nextTransaction = 0
    mocks.checkMigrationApprovals.mockImplementation(() =>
      Promise.resolve({ ethRegistryHcaApproved: isApprovedForAll }),
    )
    readContractMock.mockImplementation(
      ({ functionName }: { functionName: string }) => {
        if (functionName === 'isApprovedForAll') {
          return Promise.resolve(isApprovedForAll)
        }
        if (functionName === 'ownerOf') return Promise.resolve(OWNER)
        if (functionName === 'balanceOf') return Promise.resolve(1n)
        return Promise.resolve(true)
      },
    )
    mocks.startTransaction.mockImplementation(
      ({ request }: { request: { data: Hex; to: Address } }) => {
        if (request.data === GRANT_DATA) isApprovedForAll = true
        if (request.to === V2_CONTRACTS.ETHRegistry) {
          if (rejectFirstCleanup) {
            rejectFirstCleanup = false
            throw new Error('cleanup rejected')
          }
          isApprovedForAll = false
        }
        return `tx-${nextTransaction++}`
      },
    )
    mocks.buildAtomicMigrationBatches.mockRejectedValueOnce(
      new Error('batch preparation aborted'),
    )
    mocks.planMigrationApprovals.mockReturnValueOnce([MANAGER_APPROVAL])
    const firstPlan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [MANAGER_APPROVAL],
        migrationCleanupApprovals: [CLEANUP_APPROVAL],
      },
    }
    await expect(runExecute({ plan: firstPlan })).rejects.toMatchObject({
      name: 'MigrationCleanupError',
    })
    expect(isApprovedForAll).toBe(true)

    // A new preflight sees the existing grant and therefore plans no grant.
    mocks.planMigrationApprovals.mockReturnValue([])
    const restartedPlan = {
      ...planFor(),
      preflight: {
        ...planFor().preflight,
        migrationApprovals: [],
        migrationCleanupApprovals: [CLEANUP_APPROVAL],
      },
    }
    const { result } = await runExecute({ plan: restartedPlan })

    expect(result.completed).toBe(1)
    expect(isApprovedForAll).toBe(false)
    expect(
      readContractMock.mock.calls.filter(
        ([call]) => call.functionName === 'isApprovedForAll',
      ).length,
    ).toBeGreaterThanOrEqual(2)
  })

  it('returns immediately when no eligible names remain', async () => {
    const result = await executeMigration({
      plan: planFor([]),
      submissionGate: { signal: new AbortController().signal },
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

afterEach(() => vi.unstubAllGlobals())

describe('executeMigration with an atomic-batching wallet (EIP-5792)', () => {
  const bundledPlan = (): MigrationPlan => ({
    ...planFor(),
    hcaDeploymentRequired: true,
    canBatchAtomically: true,
    preflight: {
      ...planFor().preflight,
      migrationApprovals: [APPROVAL, MANAGER_APPROVAL],
      migrationCleanupApprovals: [CLEANUP_APPROVAL],
    },
    stepDescriptors: [
      {
        type: 'bundle',
        steps: [
          { type: 'deploy-hca' },
          { type: 'approval', approvalId: APPROVAL.id },
          { type: 'approval', approvalId: MANAGER_APPROVAL.id },
        ],
      },
      {
        type: 'bundle',
        steps: [
          {
            type: 'atomic-batch',
            index: 0,
            total: 1,
            count: 1,
            migrateCount: 1,
            copyCount: 0,
            roleGrants: [],
          },
          { type: 'cleanup', approvalId: MANAGER_APPROVAL.id },
        ],
      },
    ],
  })

  const requestOf = (call: number) =>
    mocks.startTransaction.mock.calls[call]?.[0].request

  beforeEach(() => {
    mocks.getAtomicBatchSupport.mockResolvedValue(true)
    getCodeMock.mockResolvedValue('0x')
    mocks.checkMigrationApprovals.mockResolvedValue({
      ethRegistryHcaApproved: false,
    })
    mocks.planMigrationApprovals.mockReturnValue([APPROVAL, MANAGER_APPROVAL])
    // Temporary access is live from the setup bundle until the final bundle.
    readContractMock.mockImplementation(
      ({ functionName }: { functionName: string }) => {
        if (functionName === 'ownerOf') return Promise.resolve(OWNER)
        if (functionName === 'balanceOf') return Promise.resolve(1n)
        if (functionName === 'isApprovedForAll') {
          return Promise.resolve(mocks.startTransaction.mock.calls.length === 1)
        }
        return Promise.resolve(true)
      },
    )
  })

  it('confirms setup in one bundle and the final batch with its cleanup in another', async () => {
    const refreshAccount = vi.fn(() => Promise.resolve())

    const { progressEvents, result } = await runExecute({
      plan: bundledPlan(),
      refreshAccount,
    })

    expect(mocks.startTransaction).toHaveBeenCalledTimes(2)
    expect(requestOf(0)).toEqual({
      type: 'eoa-batch',
      from: OWNER,
      chainId: 11155111,
      calls: [
        { to: FACTORY, data: DEPLOY_DATA, value: 0n },
        { to: APPROVAL_CONTRACT, data: GRANT_DATA, value: 0n },
        { to: APPROVAL_CONTRACT, data: GRANT_DATA, value: 0n },
      ],
    })
    expect(requestOf(1)).toMatchObject({
      type: 'eoa-batch',
      calls: [
        { to: HCA, data: OUTER_DATA, value: 0n },
        { to: V2_CONTRACTS.ETHRegistry },
      ],
    })
    expect(mocks.verifyStandaloneHca).toHaveBeenCalledOnce()
    expect(refreshAccount).toHaveBeenCalledOnce()
    expect(mocks.buildAtomicMigrationBatches).toHaveBeenCalledWith(
      expect.objectContaining({ maxOuterGas: 14_800_000n }),
    )
    expect(result.txHashes).toEqual([hashFor(1), hashFor(2)])
    expect(progressEvents.at(-1)).toMatchObject({
      currentStep: 2,
      totalSteps: 2,
    })
  })

  it('verifies an existing HCA before granting it anything', async () => {
    getCodeMock.mockResolvedValue('0x6000')
    mocks.verifyStandaloneHca.mockRejectedValueOnce(new Error('wrong owner'))

    await expect(runExecute({ plan: bundledPlan() })).rejects.toMatchObject({
      name: 'MigrationError',
    })
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })

  it('asks for a new preview when the wallet can no longer bundle', async () => {
    mocks.getAtomicBatchSupport.mockResolvedValue(false)

    await expect(runExecute({ plan: bundledPlan() })).rejects.toMatchObject({
      name: 'MigrationPlanChangedError',
    })
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })
})

describe('durable migration completion handoff', () => {
  const scope = { chainId: 11155111, owner: OWNER, hca: HCA }
  const checkpointKeys = () =>
    Array.from(
      { length: localStorage.length },
      (_, index) => localStorage.key(index) ?? '',
    ).filter((key) => key.startsWith('ens-apps:migration-completion:'))

  it('writes receipt-backed evidence after verification and before removing retry protection', async () => {
    mocks.verifyAtomicMigrationBatch.mockImplementationOnce(async () => {
      expect(checkpointKeys()).toHaveLength(0)
      expect(loadSubmittedAtomicMigrationBatches(scope)).toHaveLength(1)
      return { batchIndex: 0, status: 'confirmed', results: [] }
    })
    const onBatchComplete = vi.fn(() => {
      expect(checkpointKeys()).toHaveLength(1)
      expect(loadSubmittedAtomicMigrationBatches(scope)).toHaveLength(0)
    })
    await runExecute({ onBatchComplete })
    expect(onBatchComplete).toHaveBeenCalledOnce()
    const checkpoint = JSON.parse(
      localStorage.getItem(checkpointKeys()[0] ?? '') ?? '{}',
    )
    expect(checkpoint).toMatchObject({
      transactionHash: hashFor(1),
      operation: { name: 'alice.eth', action: 'migrate' },
    })
  })

  it('retains the submitted journal and suppresses success if checkpoint storage fails', async () => {
    const original = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key.startsWith('ens-apps:migration-completion:'))
        throw new Error('Checkpoint quota exceeded')
      original(key, value)
    })
    const onBatchComplete = vi.fn()
    await expect(runExecute({ onBatchComplete })).rejects.toThrow()
    expect(loadSubmittedAtomicMigrationBatches(scope)).toHaveLength(1)
    expect(onBatchComplete).not.toHaveBeenCalled()
    expect(mocks.startTransaction).toHaveBeenCalledOnce()
  })

  it('persists proof when recovering a submitted confirmed batch without resubmitting', async () => {
    persistSubmittedAtomicMigrationBatch(scope, {
      intentId: 'recovered',
      hash: hashFor(9),
      names: ['alice.eth'],
      operations: [{ name: 'alice.eth', action: 'migrate' }],
    })
    await runExecute()
    const checkpoint = JSON.parse(
      localStorage.getItem(checkpointKeys()[0] ?? '') ?? '{}',
    )
    expect(checkpoint.transactionHash).toBe(hashFor(9))
    expect(loadSubmittedAtomicMigrationBatches(scope)).toHaveLength(0)
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })
})

it.each([false, true])(
  'verifies older completed receipt journals before deleting them (forged=%s)',
  async (forged) => {
    const scope = { chainId: 11155111, owner: OWNER, hca: HCA }
    const completed = { name: 'alice.eth', action: 'migrate' as const }
    const hash = hashFor(9)
    persistSubmittedAtomicMigrationBatch(scope, {
      intentId: 'older-completed',
      hash,
      names: ['alice.eth'],
      operations: [completed],
    })
    const contracts = getDestinationContracts(11155111)
    const blockHash = hashFor(99)
    const input = buildHcaOwnerExecutionCall({
      hca: HCA,
      calls: [
        buildMigrationHelperCall([
          {
            name: 'alice.eth',
            tokenType: 'unwrapped',
            parentName: 'eth',
            data: createMigrationData({
              label: 'alice',
              owner: OWNER,
              resolver: RESOLVER,
            }),
          },
        ]),
      ],
    }).data
    getTransactionReceiptMock.mockResolvedValue({
      status: 'success',
      blockNumber: 123n,
      blockHash,
      transactionHash: hash,
      from: OWNER,
      to: HCA,
    })
    getTransactionMock.mockResolvedValue({
      hash,
      blockNumber: 123n,
      blockHash,
      from: forged ? RESOLVER : OWNER,
      to: HCA,
      input,
    })
    readContractMock.mockImplementation(({ functionName }) =>
      Promise.resolve(
        functionName === 'verifyContract'
          ? contracts.standaloneHcaImplementation
          : OWNER,
      ),
    )
    const plan = {
      ...planFor([]),
      registryContext: [classifiedFor('alice')],
      priorCompletedOperations: [completed],
    }
    const pending = runExecute({ plan, reconcileBeforeSubmit: true })
    if (forged) {
      await expect(pending).rejects.toMatchObject({
        cause: {
          message: expect.stringContaining('transaction does not match'),
        },
      })
      expect(loadSubmittedAtomicMigrationBatches(scope)).toHaveLength(1)
    } else {
      await expect(pending).resolves.toBeDefined()
      expect(loadSubmittedAtomicMigrationBatches(scope)).toHaveLength(0)
      expect(getTransactionMock).toHaveBeenCalledOnce()
    }
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  },
)
