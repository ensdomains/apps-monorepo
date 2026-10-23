import type { Signer, TransactionRequest } from '@ens-apps/transaction-manager'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import { renderHook } from '@testing-library/react'
import type { Config as WagmiConfig } from '@wagmi/core'
import { Storage } from 'happy-dom'
import type { Address, Hex, PublicClient, TransactionReceipt } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { V2_CONTRACTS } from '../contracts/addresses'

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
  assertNoLiveSubregistryOverwrite: vi.fn(),
  useSmartAccountContext: vi.fn(),
  usePublicClient: vi.fn(),
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

vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: mocks.useSmartAccountContext,
}))

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  usePublicClient: mocks.usePublicClient,
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

import type { V1Domain } from '@ens-apps/migration'
import { useMigrationRecoverySnapshot } from '../hooks/useMigrationRecoverySnapshot'
import type {
  AtomicMigrationNameExecution,
  BuildAtomicMigrationBatchesParams,
} from './buildAtomicMigrationBatches'
import { adjustPlanForRetry, type MigrationPlan } from './buildMigrationPlan'
import type { ClassifiedName, CopyClassifiedName } from './classifyNames'
import { groupClassifiedNames } from './classifyNames'
import {
  type MigrationApproval,
  temporaryMigrationHcaApproval,
} from './migrationApprovals'
import {
  loadMigrationRecoverySnapshot,
  loadPendingAtomicMigrationIntents,
} from './migrationBatchJournal'
import { executeMigration } from './migrationService'

const OWNER: Address = '0x0000000000000000000000000000000000000001'
const HCA: Address = '0x0000000000000000000000000000000000000002'
const RESOLVER: Address = '0x0000000000000000000000000000000000000004'
const V1_RESOLVER: Address = '0x0000000000000000000000000000000000000005'
const APPROVAL_CONTRACT: Address = '0x0000000000000000000000000000000000000006'
const MANAGER: Address = '0x0000000000000000000000000000000000000007'
const CHAIN_ID = 11155111
const SCOPE = { chainId: CHAIN_ID, owner: OWNER, hca: HCA }

const OUTER_DATA: Hex = '0xcafe'
const GRANT_DATA: Hex = '0x01'

const WAGMI = {} as WagmiConfig
const SIGNER = { type: 'eoa', walletClient: {} } as unknown as Signer
const HCA_CLIENT = {
  getAddress: vi.fn(() => HCA),
  getInitData: vi.fn(),
} as unknown as Pick<RhinestoneAccount, 'getAddress' | 'getInitData'>

const getCodeMock = vi.fn()
const estimateGasMock = vi.fn()
const readContractMock = vi.fn()
const waitForReceiptMock = vi.fn()
const PUBLIC_CLIENT = {
  chain: { id: CHAIN_ID },
  getCode: getCodeMock,
  estimateGas: estimateGasMock,
  readContract: readContractMock,
  getTransactionReceipt: vi.fn(),
  getTransaction: vi.fn(),
  waitForTransactionReceipt: waitForReceiptMock,
} as unknown as PublicClient

const MANAGER_APPROVAL: MigrationApproval = {
  kind: 'operator',
  id: 'eth-registry:hca',
  contractAddress: APPROVAL_CONTRACT,
  operatorAddress: HCA,
}
const CLEANUP_APPROVAL = temporaryMigrationHcaApproval(HCA)

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

const classifiedFor = (
  label: string,
  managerAddress: Address | null = null,
): ClassifiedName => ({
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
  managerAddress,
})

const copyClassifiedFor = (): CopyClassifiedName => ({
  action: 'copy',
  domain: {
    ...domainFor('sub'),
    id: hashFor(20),
    name: 'sub.alice.eth',
    parent: { name: 'alice.eth', wrappedDomain: null },
  } as V1Domain,
  tokenType: 'registry-child',
  copySource: 'registry',
  sourceExpiry: (1n << 64n) - 1n,
  label: 'sub',
  parentName: 'alice.eth',
  fuses: 0n,
  tokenHolder: OWNER,
  v1ResolverAddress: V1_RESOLVER,
  resolverStrategy: 'to-owned-permres',
  registryController: null,
  managerAddress: null,
})

const executionFor = (
  classified: ClassifiedName,
): AtomicMigrationNameExecution => {
  const name = classified.domain.name
  return {
    classified,
    directRoute:
      classified.action === 'migrate'
        ? {
            name,
            receiver: RESOLVER,
            parentDependency: null,
            expectedWrapperRegistry: null,
            receiverReadiness: 'migration-controller',
          }
        : null,
    migrationData: null,
    innerExecutions: [],
    walletExecutions: [],
    verificationExpectations: [
      {
        id: `${name}:name-owner`,
        type: 'name-owner',
        name,
        label: classified.label,
        node: classified.domain.id as Hex,
        resource: 1n,
        tokenType: classified.tokenType,
        registryPath: {
          type: 'eth-registry-2ld',
          registry: RESOLVER,
          label: classified.label,
          resource: 1n,
        },
        expectedOwner: OWNER,
      },
    ],
  }
}

const makePlan = (params: {
  readonly classified: readonly ClassifiedName[]
  readonly executions?: readonly ClassifiedName[]
  readonly approvals?: readonly MigrationApproval[]
}): MigrationPlan => {
  const nameExecutions = (params.executions ?? params.classified).map(
    executionFor,
  )
  const hasApprovals = (params.approvals?.length ?? 0) > 0
  return {
    hcaAddress: HCA,
    hcaDeploymentRequired: false,
    migrationOwner: OWNER,
    classified: params.classified,
    registryContext: params.classified,
    ineligible: [],
    groups: groupClassifiedNames([...params.classified]),
    preflight: {
      skipFetchProfilesPhase: true,
      migrationApprovals: params.approvals ?? [],
      migrationCleanupApprovals: hasApprovals ? [CLEANUP_APPROVAL] : [],
    },
    ownedPermRes: RESOLVER,
    profiles: new Map(),
    directRoutes: new Map(),
    atomicBatches: [
      {
        index: 0,
        names: nameExecutions.map(({ classified }) => classified.domain.name),
        operations: nameExecutions.map(({ classified }) => ({
          name: classified.domain.name,
          action: classified.action,
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

const runExecute = (
  plan: MigrationPlan,
  reconcileBeforeSubmit?: boolean,
): ReturnType<typeof executeMigration> =>
  executeMigration({
    plan,
    wagmiConfig: WAGMI,
    publicClient: PUBLIC_CLIENT,
    signer: SIGNER,
    hcaClient: HCA_CLIENT,
    refreshAccount: vi.fn(),
    onProgress: vi.fn(),
    reconcileBeforeSubmit,
  })

type Prompt = 'grant' | 'batch' | 'revoke'

const promptFor = (request: TransactionRequest): Prompt => {
  if (request.type === 'eoa' && request.to === APPROVAL_CONTRACT) return 'grant'
  if (request.type === 'eoa' && request.to === V2_CONTRACTS.ETHRegistry) {
    return 'revoke'
  }
  return 'batch'
}

const promptsStarted = (): readonly Prompt[] =>
  mocks.startTransaction.mock.calls.map(([transaction]) =>
    promptFor(
      (transaction as { readonly request: TransactionRequest }).request,
    ),
  )

/** Lets wallet prompts settle only when the test opens the gate. */
const createGate = () => {
  let open: () => void = () => undefined
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { opened, open: () => open() }
}

const flushMacrotasks = async (rounds = 20): Promise<void> => {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

/** Each estimate returns only the first remaining name, so names go in separate batches. */
const buildOneNamePerBatch = async ({
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
}

// Live ETHRegistry operator state for the HCA, flipped by grant/revoke prompts.
let isHcaGranted = false

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', new Storage())
  isHcaGranted = false

  let nextTransaction = 0
  mocks.startTransaction.mockImplementation(
    ({ request }: { readonly request: TransactionRequest }) => {
      const prompt = promptFor(request)
      if (prompt === 'grant') isHcaGranted = true
      if (prompt === 'revoke') isHcaGranted = false
      return `tx-${nextTransaction++}`
    },
  )
  const hashForTransaction = (txId: string) =>
    hashFor(Number.parseInt(txId.slice('tx-'.length), 10) + 1)
  mocks.waitForTransactionHash.mockImplementation((txId: string) =>
    Promise.resolve(hashForTransaction(txId)),
  )
  mocks.waitForTransaction.mockImplementation((txId: string) =>
    Promise.resolve({ hash: hashForTransaction(txId) }),
  )

  mocks.verifyStandaloneHca.mockResolvedValue(HCA)
  mocks.checkMigrationApprovals.mockImplementation(() =>
    Promise.resolve({ ethRegistryHcaApproved: isHcaGranted }),
  )
  mocks.planMigrationApprovals.mockImplementation(
    ({ needs }: { readonly needs: { requiresManagerRestoration: boolean } }) =>
      needs.requiresManagerRestoration && !isHcaGranted
        ? [MANAGER_APPROVAL]
        : [],
  )
  mocks.buildMigrationApprovalCall.mockImplementation(
    (approval: MigrationApproval) => ({
      to: approval.contractAddress,
      data: GRANT_DATA,
      value: 0n,
    }),
  )
  mocks.assertNoLiveSubregistryOverwrite.mockResolvedValue(undefined)
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
    status: 'incomplete',
    verification: { batchIndex: 0, status: 'confirmed', results: [] },
    mismatches: [],
  })
  mocks.verifyAtomicMigrationBatch.mockResolvedValue({
    batchIndex: 0,
    status: 'confirmed',
    results: [],
  })

  getCodeMock.mockResolvedValue('0x6000')
  // A real RPC round trip yields to the event loop, which lets React effects run.
  estimateGasMock.mockImplementation(
    () => new Promise((resolve) => setTimeout(() => resolve(500_000n), 5)),
  )
  readContractMock.mockImplementation(
    ({ functionName }: { readonly functionName: string }) => {
      if (functionName === 'ownerOf') return Promise.resolve(OWNER)
      if (functionName === 'balanceOf') return Promise.resolve(1n)
      if (functionName === 'isApprovedForAll') {
        return Promise.resolve(isHcaGranted)
      }
      return Promise.resolve(true)
    },
  )
  waitForReceiptMock.mockResolvedValue({
    status: 'success',
    blockNumber: 123n,
  } as TransactionReceipt)

  mocks.useSmartAccountContext.mockReturnValue({
    ownerAddress: OWNER,
    accountAddress: HCA,
  })
  mocks.usePublicClient.mockReturnValue({ chain: { id: CHAIN_ID } })
})

describe('WEB-1942 known migration execution bugs', () => {
  // Bug: the mounted recovery hook deletes the snapshot persistRecoveryPlan just wrote,
  // because no intent is recorded yet. Remove .fails when fixed.
  it.fails('WEB-1942 #1: keeps the copy recovery snapshot through the first batch prompt and a failure before verification', async () => {
    renderHook(() => useMigrationRecoverySnapshot())
    mocks.buildAtomicMigrationBatches.mockImplementation(buildOneNamePerBatch)
    const gate = createGate()
    mocks.waitForTransactionHash.mockImplementationOnce(async () => {
      await gate.opened
      throw new Error('provider response was lost')
    })

    const run = runExecute(
      makePlan({ classified: [classifiedFor('alice'), copyClassifiedFor()] }),
    )
    await vi.waitFor(() => expect(promptsStarted()).toEqual(['batch']))
    await flushMacrotasks()

    expect(loadMigrationRecoverySnapshot(SCOPE)).not.toBeNull()
    gate.open()
    await expect(run).rejects.toBeInstanceOf(Error)
    await flushMacrotasks()
    expect(loadMigrationRecoverySnapshot(SCOPE)).not.toBeNull()
  })

  // Bug: same hook deletion; a single-batch copy plan reaches cleanup with no snapshot.
  // Remove .fails when fixed.
  it.fails('WEB-1942 #1: keeps the copy recovery snapshot at the revoke prompt of a single-batch copy plan', async () => {
    renderHook(() => useMigrationRecoverySnapshot())
    const gate = createGate()
    mocks.waitForTransactionHash.mockImplementation(async (txId: string) => {
      const index = Number.parseInt(txId.slice('tx-'.length), 10)
      if (promptsStarted()[index] === 'revoke') await gate.opened
      return hashFor(index + 1)
    })

    const run = runExecute(
      makePlan({
        classified: [classifiedFor('alice', MANAGER), copyClassifiedFor()],
        approvals: [MANAGER_APPROVAL],
      }),
    )
    await vi.waitFor(() =>
      expect(promptsStarted()).toEqual(['grant', 'batch', 'revoke']),
    )
    await flushMacrotasks()

    expect(loadMigrationRecoverySnapshot(SCOPE)).not.toBeNull()
    gate.open()
    await run
  })

  // Bug: no per-scope run lock; a second run for the same owner/HCA prompts and journals
  // while a detached first run is still mid-batch. Remove .fails when fixed.
  it.fails('WEB-1942 #2: refuses or waits on a second run for the same scope while the first is still executing', async () => {
    const gate = createGate()
    mocks.waitForTransactionHash.mockImplementation(async (txId: string) => {
      await gate.opened
      return hashFor(Number.parseInt(txId.slice('tx-'.length), 10) + 1)
    })

    const first = runExecute(makePlan({ classified: [classifiedFor('alice')] }))
    await vi.waitFor(() => expect(promptsStarted()).toEqual(['batch']))
    const journalBefore = loadPendingAtomicMigrationIntents(SCOPE)

    const second = runExecute(makePlan({ classified: [classifiedFor('bob')] }))
    await flushMacrotasks()

    expect(promptsStarted()).toEqual(['batch'])
    expect(loadPendingAtomicMigrationIntents(SCOPE)).toEqual(journalBefore)
    gate.open()
    await Promise.allSettled([first, second])
  })

  // Bug: cleanup rejects an HCA grant that turned active outside the flow after every
  // batch verified, so a completed migration surfaces as MigrationPlanChangedError.
  // Remove .fails when fixed.
  it.fails('WEB-1942 #5: reports verified names as complete when the HCA grant turns active during the batch', async () => {
    mocks.startTransaction.mockImplementation(
      ({ request }: { readonly request: TransactionRequest }) => {
        if (promptFor(request) === 'batch') isHcaGranted = true
        return `tx-${mocks.startTransaction.mock.calls.length - 1}`
      },
    )

    await expect(
      runExecute(makePlan({ classified: [classifiedFor('alice')] })),
    ).resolves.toMatchObject({
      completed: 1,
      completedOperations: [{ name: 'alice.eth', action: 'migrate' }],
    })
  })

  // Bug: a rejected batch prompt revokes the temporary grant, so the retry re-grants it.
  // Encodes the PROPOSED keep-grant-on-rejection policy, pending a security decision.
  // Remove .fails when fixed.
  it.fails('WEB-1942 #6: a rejected batch retried once costs four wallet prompts in total', async () => {
    const plan = makePlan({
      classified: [classifiedFor('alice', MANAGER)],
      approvals: [MANAGER_APPROVAL],
    })
    mocks.waitForTransactionHash.mockImplementation((txId: string) => {
      const index = Number.parseInt(txId.slice('tx-'.length), 10)
      return promptsStarted().indexOf('batch') === index
        ? Promise.reject(
            Object.assign(new Error('User rejected the request.'), {
              name: 'UserRejectedRequestError',
            }),
          )
        : Promise.resolve(hashFor(index + 1))
    })

    await expect(runExecute(plan)).rejects.toMatchObject({
      name: 'MigrationUserRejectedError',
    })
    await runExecute(plan, true)

    expect(promptsStarted()).toEqual(['grant', 'batch', 'batch', 'revoke'])
  })

  // Bug: adjustPlanForRetry matches executions by object identity, so a structurally equal
  // classified copy drops that name's execution. Remove .fails when fixed.
  it.fails('WEB-1942 #7: keeps executions for remaining names when classified entries are structurally equal copies', async () => {
    const alice = classifiedFor('alice')
    const bob = classifiedFor('bob')
    const plan = makePlan({
      classified: [alice, structuredClone(bob)],
      executions: [alice, bob],
    })

    const retryPlan = adjustPlanForRetry(plan, ['alice.eth'])

    expect(retryPlan.atomicBatches.flatMap(({ names }) => names)).toEqual([
      'bob.eth',
    ])
    await expect(runExecute(retryPlan, true)).resolves.toMatchObject({
      completed: 1,
    })
  })
})
