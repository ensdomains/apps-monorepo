import type { Signer } from '@ens-apps/transaction-manager'
import type { Config as WagmiConfig } from '@wagmi/core'
import type { Address, Hex, PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: { startTransaction: vi.fn(() => 'tx-id') },
  waitForTransaction: vi.fn(),
}))

vi.mock('@wagmi/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wagmi/core')>()
  return {
    ...actual,
    writeContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    readContract: vi.fn(),
  }
})

vi.mock('./ensureOwnedPermRes', () => ({
  ensureOwnedPermRes: vi.fn(),
  findExistingPermRes: vi.fn(),
  predictOwnedPermResAddress: vi.fn(() =>
    Promise.resolve('0x000000000000000000000000000000000000d002'),
  ),
  OwnedResolverDeployError: class OwnedResolverDeployError extends Error {
    name = 'OwnedResolverDeployError'
  },
}))

vi.mock('./fetchV1Profiles', () => ({
  fetchV1Profiles: vi.fn(() => Promise.resolve(new Map())),
  profileMapKey: (h: Hex): Hex => h.toLowerCase() as Hex,
  ProfileFetchError: class ProfileFetchError extends Error {
    phase: 'subgraph' | 'onchain' = 'subgraph'
  },
}))

vi.mock('./preflightChecks', () => ({
  checkOwnership: vi.fn(),
  checkFrozenApproval: vi.fn(),
  runEligibilityChecks: vi.fn(),
}))

vi.mock('./checkHelperApprovals', () => ({
  approvalNeedsFor: vi.fn((groups) => ({
    hasUnwrapped: groups.unwrapped.length > 0,
    hasWrapped:
      groups.unlocked.length > 0 ||
      groups.locked2ld.length > 0 ||
      groups.childNames.size > 0,
  })),
  checkHelperApprovals: vi.fn(() =>
    Promise.resolve({
      baseRegistrarApproved: true,
      nameWrapperApproved: true,
    }),
  ),
}))

import { waitForTransaction } from '@ens-apps/transaction-manager'
import { waitForTransactionReceipt, writeContract } from '@wagmi/core'
import { buildMigrationPlan } from './buildMigrationPlan'
import { checkHelperApprovals } from './checkHelperApprovals'
import type { MigrationPreflight } from './computeMigrationPreflight'
import { ensureOwnedPermRes } from './ensureOwnedPermRes'
import { fetchV1Profiles } from './fetchV1Profiles'
import { executeMigration, type MigrationProgress } from './migrationService'
import type { V1Domain } from './v1SubgraphClient'

const waitForTransactionMock = vi.mocked(waitForTransaction)
const writeContractMock = vi.mocked(writeContract)
const waitForTransactionReceiptMock = vi.mocked(waitForTransactionReceipt)
const ensureOwnedPermResMock = vi.mocked(ensureOwnedPermRes)
const fetchV1ProfilesMock = vi.mocked(fetchV1Profiles)
const checkSCAApprovalsMock = vi.mocked(checkHelperApprovals)

const OWNER: Address = '0x0000000000000000000000000000000000000001'
const SCA: Address = '0x0000000000000000000000000000000000000002'
const V1_RESOLVER: Address = '0x000000000000000000000000000000000000d003'
const PERM_RES: Address = '0x000000000000000000000000000000000000d002'

const WAGMI = {} as WagmiConfig
const PUBLIC_CLIENT = {
  chain: { id: 11155111 },
  estimateGas: vi.fn(() => Promise.resolve(15_000_000n)),
} as unknown as PublicClient
const SIGNER = { type: 'erc4337' } as unknown as Signer

const unwrappedDomain = (id: string): V1Domain =>
  ({
    id,
    name: `${id}.eth`,
    labelName: id,
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

const DEFAULT_PREFLIGHT: MigrationPreflight = {
  preExistingOwnedPermRes: null,
  skipApprovalPhase: false,
  skipFetchProfilesPhase: false,
  baseRegistrarApproved: false,
  nameWrapperApproved: false,
}

const runExecute = async (
  overrides: {
    domains?: V1Domain[]
    preflight?: MigrationPreflight
    onBatchComplete?: (names: readonly string[], hash: Hex) => void
  } = {},
) => {
  const progressEvents: MigrationProgress[] = []
  const domains = overrides.domains ?? [unwrappedDomain('alice')]
  const preflight = overrides.preflight ?? DEFAULT_PREFLIGHT
  const plan = await buildMigrationPlan({
    domains,
    migrationOwner: OWNER,
    wagmiConfig: WAGMI,
    publicClient: PUBLIC_CLIENT,
    preflight,
    hasBaseRegistrarApproval: false,
    hasNameWrapperApproval: false,
  })
  const result = await executeMigration({
    plan,
    wagmiConfig: WAGMI,
    publicClient: PUBLIC_CLIENT,
    signer: SIGNER,
    accountAddress: SCA,
    onProgress: (p) => progressEvents.push(p),
    onBatchComplete: overrides.onBatchComplete,
  })
  return { result, progressEvents, plan }
}

beforeEach(() => {
  vi.clearAllMocks()
  checkSCAApprovalsMock.mockResolvedValue({
    baseRegistrarApproved: true,
    nameWrapperApproved: true,
  })
  fetchV1ProfilesMock.mockResolvedValue(new Map())
  ensureOwnedPermResMock.mockResolvedValue(PERM_RES)
  waitForTransactionMock.mockResolvedValue({
    hash: '0xdeadbeef' as Hex,
  } as Awaited<ReturnType<typeof waitForTransaction>>)
  waitForTransactionReceiptMock.mockResolvedValue({
    status: 'success',
  } as Awaited<ReturnType<typeof waitForTransactionReceipt>>)
})

describe('executeMigration', () => {
  it('returns empty result when there are no classifiable domains', async () => {
    const { result } = await runExecute({
      domains: [{ ...unwrappedDomain('x'), labelName: null } as V1Domain],
    })
    expect(result.completed).toBe(0)
    expect(result.txHashes).toEqual([])
    expect(result.ineligible.map((n) => n.reason)).toEqual(['unknown-label'])
    expect(waitForTransactionMock).not.toHaveBeenCalled()
  })

  it('submits one batch for a single classified name and returns its tx hash', async () => {
    const { result, progressEvents } = await runExecute()
    expect(result.completed).toBe(1)
    expect(result.txHashes).toEqual(['0xdeadbeef'])
    expect(waitForTransactionMock).toHaveBeenCalledTimes(1)
    expect(progressEvents.at(-1)?.description).toMatch(/upgrade complete/i)
  })

  it('skips approval phase when preflight.skipApprovalPhase is true', async () => {
    await runExecute({
      preflight: {
        preExistingOwnedPermRes: null,
        skipApprovalPhase: true,
        skipFetchProfilesPhase: true,
        baseRegistrarApproved: false,
        nameWrapperApproved: false,
      },
    })
    expect(checkSCAApprovalsMock).not.toHaveBeenCalled()
    expect(writeContractMock).not.toHaveBeenCalled()
  })

  it('calls writeContract for BaseRegistrar when unwrapped names need approval', async () => {
    checkSCAApprovalsMock.mockResolvedValueOnce({
      baseRegistrarApproved: false,
      nameWrapperApproved: true,
    })
    writeContractMock.mockResolvedValueOnce('0xapproval' as Hex)
    const { result } = await runExecute()
    expect(writeContractMock).toHaveBeenCalledTimes(1)
    expect(result.txHashes[0]).toBe('0xapproval')
    expect(result.txHashes).toContain('0xdeadbeef')
  })

  it('uses preExistingOwnedPermRes without calling ensureOwnedPermRes', async () => {
    await runExecute({
      preflight: {
        preExistingOwnedPermRes: PERM_RES,
        skipApprovalPhase: true,
        skipFetchProfilesPhase: true,
        baseRegistrarApproved: false,
        nameWrapperApproved: false,
      },
      domains: [
        {
          ...unwrappedDomain('alice'),
          resolver: null,
        } as V1Domain,
      ],
    })
    expect(ensureOwnedPermResMock).not.toHaveBeenCalled()
  })

  it('throws MigrationUserRejectedError on user rejection of a batch', async () => {
    const rejection = Object.assign(new Error('user rejected the request'), {
      name: 'UserRejectedRequestError',
    })
    waitForTransactionMock.mockRejectedValueOnce(rejection)

    await expect(runExecute()).rejects.toSatisfy(
      (e) => e instanceof Error && e.name === 'MigrationUserRejectedError',
    )
  })

  it('throws MigrationError wrapping the cause on non-rejection batch failures', async () => {
    waitForTransactionMock.mockRejectedValueOnce(new Error('rpc broke'))
    await expect(runExecute()).rejects.toSatisfy(
      (e) => e instanceof Error && e.name === 'MigrationError',
    )
  })

  it('splits 150 names into multiple migrate batches and fires onBatchComplete per batch', async () => {
    const domains = Array.from({ length: 150 }, (_, i) =>
      unwrappedDomain(`alice${i}`),
    )
    let txCounter = 0
    waitForTransactionMock.mockImplementation(() =>
      Promise.resolve({ hash: `0xbatch${txCounter++}` as Hex } as Awaited<
        ReturnType<typeof waitForTransaction>
      >),
    )
    const onBatchComplete = vi.fn()
    const { result, plan } = await runExecute({ domains, onBatchComplete })
    expect(plan.migrateCalls.length).toBe(2)
    expect(plan.batches.map((b) => b.names.length)).toEqual([100, 50])
    expect(onBatchComplete).toHaveBeenCalledTimes(2)
    expect(onBatchComplete.mock.calls[0]![0]).toHaveLength(100)
    expect(onBatchComplete.mock.calls[1]![0]).toHaveLength(50)
    expect(result.completed).toBe(150)
  })

  it('halts after mid-batch failure and preserves prior tx hashes', async () => {
    const domains = Array.from({ length: 150 }, (_, i) =>
      unwrappedDomain(`bob${i}`),
    )
    let txCounter = 0
    waitForTransactionMock.mockImplementation(() => {
      const i = txCounter++
      if (i === 1) return Promise.reject(new Error('rpc broke on batch 2'))
      return Promise.resolve({ hash: `0xbatch${i}` as Hex } as Awaited<
        ReturnType<typeof waitForTransaction>
      >)
    })
    const onBatchComplete = vi.fn()
    await expect(runExecute({ domains, onBatchComplete })).rejects.toSatisfy(
      (e) => e instanceof Error && e.name === 'MigrationError',
    )
    expect(onBatchComplete).toHaveBeenCalledTimes(1)
  })

  it('ineligible names are returned and not counted as completed', async () => {
    const bad = {
      ...unwrappedDomain('bad'),
      wrappedOwner: { id: OWNER },
      wrappedDomain: { fuses: 1 | 4, expiryDate: '99999999999' },
    } as V1Domain
    const good = unwrappedDomain('good')
    const { result } = await runExecute({ domains: [bad, good] })
    expect(result.completed).toBe(1)
    expect(result.ineligible.map((n) => n.domain.id)).toEqual(['bad'])
  })
})
