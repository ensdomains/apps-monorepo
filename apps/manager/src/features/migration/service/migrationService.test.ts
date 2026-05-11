import {
  type EOASigner,
  type Signer,
  type TransactionRequest,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import type { Config as WagmiConfig } from '@wagmi/core'
import { decodeFunctionData, type Hex, type PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATION_HELPER_ABI } from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import { makeDomain, OWNER } from './_fixtures'
import { buildMigrationPlan } from './buildMigrationPlan'
import type { MigrationPreflight } from './computeMigrationPreflight'
import { executeMigration, type MigrationProgress } from './migrationService'
import type { V1Domain } from './v1SubgraphClient'

vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: { startTransaction: vi.fn(() => 'tx-id') },
  waitForTransaction: vi.fn(),
}))

const waitForTransactionMock = vi.mocked(waitForTransaction)
const startTransactionMock = vi.mocked(transactionManager.startTransaction)

const WAGMI = {} as WagmiConfig
const PUBLIC_CLIENT = { chain: { id: 11155111 } } as unknown as PublicClient
const SIGNER = {
  type: 'eoa',
  walletClient: { account: { address: OWNER } },
} as unknown as EOASigner

const DEFAULT_PREFLIGHT: MigrationPreflight = {
  preExistingOwnedPermRes: null,
  skipApprovalPhase: true,
  skipFetchProfilesPhase: true,
  needsBaseRegistrarApproval: false,
  needsNameWrapperApproval: false,
}

const unwrappedDomain = (label: string): V1Domain =>
  makeDomain({
    id: `0x${label}`,
    labelName: label,
    name: `${label}.eth`,
    isWrapped: false,
    registrantId: OWNER,
    ownerId: OWNER,
  })

const wrappedDomain = (label: string): V1Domain =>
  makeDomain({
    id: `0x${label}`,
    labelName: label,
    name: `${label}.eth`,
    isWrapped: true,
    registrantId: null,
    wrappedOwnerId: OWNER,
    ownerId: OWNER,
  })

const runExecute = async (
  overrides: {
    domains?: V1Domain[]
    preflight?: MigrationPreflight
    onBatchComplete?: (names: readonly string[], txHash: Hex) => void
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
  })
  const result = await executeMigration({
    plan,
    wagmiConfig: WAGMI,
    publicClient: PUBLIC_CLIENT,
    signer: SIGNER,
    accountAddress: OWNER,
    onProgress: (p) => progressEvents.push(p),
    onBatchComplete: overrides.onBatchComplete,
  })
  return { result, progressEvents, plan }
}

const requestAt = (index: number): TransactionRequest => {
  const intent = startTransactionMock.mock.calls[index]?.[0]
  if (!intent || intent.type !== 'custom') {
    throw new Error(`Missing custom transaction at index ${index}`)
  }
  return intent.request
}

beforeEach(() => {
  vi.clearAllMocks()
  waitForTransactionMock.mockResolvedValue({
    hash: '0xdeadbeef' as Hex,
  } as Awaited<ReturnType<typeof waitForTransaction>>)
})

describe('executeMigration', () => {
  it('returns empty result when there are no classifiable domains', async () => {
    const { result } = await runExecute({
      domains: [makeDomain({ labelName: null })],
    })

    expect(result.completed).toBe(0)
    expect(result.txHashes).toEqual([])
    expect(result.ineligible.map((n) => n.reason)).toEqual(['unknown-label'])
    expect(waitForTransactionMock).not.toHaveBeenCalled()
  })

  it('submits one EOA MigrationHelper transaction for classified names', async () => {
    const onBatchComplete = vi.fn()
    const { result, progressEvents } = await runExecute({ onBatchComplete })

    expect(result.completed).toBe(1)
    expect(result.txHashes).toEqual(['0xdeadbeef'])
    expect(waitForTransactionMock).toHaveBeenCalledTimes(1)
    expect(startTransactionMock).toHaveBeenCalledTimes(1)

    const request = requestAt(0)
    expect(request.type).toBe('eoa')
    expect(request.from).toBe(OWNER)
    expect(request.to).toBe(V2_CONTRACTS.MigrationHelper)
    if (!request.data) throw new Error('Migration request data missing')

    const decoded = decodeFunctionData({
      abi: MIGRATION_HELPER_ABI,
      data: request.data,
    })
    expect(decoded.functionName).toBe('migrate')
    expect(request.data).not.toContain('b88d4fde')
    expect(request.data).not.toContain('f242432a')
    expect(onBatchComplete).toHaveBeenCalledWith(['alice.eth'], '0xdeadbeef')
    expect(progressEvents.at(-1)?.description).toMatch(/MigrationHelper/i)
  })

  it('submits BaseRegistrar approval, NameWrapper approval, then helper migrate via EOA', async () => {
    waitForTransactionMock
      .mockResolvedValueOnce({ hash: '0xbase' as Hex } as Awaited<
        ReturnType<typeof waitForTransaction>
      >)
      .mockResolvedValueOnce({ hash: '0xwrapper' as Hex } as Awaited<
        ReturnType<typeof waitForTransaction>
      >)
      .mockResolvedValueOnce({ hash: '0xmigrate' as Hex } as Awaited<
        ReturnType<typeof waitForTransaction>
      >)

    const { result } = await runExecute({
      domains: [unwrappedDomain('alice'), wrappedDomain('bob')],
      preflight: {
        ...DEFAULT_PREFLIGHT,
        skipApprovalPhase: false,
        needsBaseRegistrarApproval: true,
        needsNameWrapperApproval: true,
      },
    })

    expect(result.txHashes).toEqual(['0xbase', '0xwrapper', '0xmigrate'])
    expect(startTransactionMock).toHaveBeenCalledTimes(3)
    expect(requestAt(0)).toMatchObject({
      type: 'eoa',
      to: V1_CONTRACTS.BaseRegistrar,
    })
    expect(requestAt(1)).toMatchObject({
      type: 'eoa',
      to: V1_CONTRACTS.NameWrapper,
    })
    expect(requestAt(2)).toMatchObject({
      type: 'eoa',
      to: V2_CONTRACTS.MigrationHelper,
    })
  })

  it('throws MigrationUserRejectedError on user rejection', async () => {
    const rejection = Object.assign(new Error('user rejected the request'), {
      name: 'UserRejectedRequestError',
    })
    waitForTransactionMock.mockRejectedValueOnce(rejection)

    await expect(runExecute()).rejects.toSatisfy(
      (e) => e instanceof Error && e.name === 'MigrationUserRejectedError',
    )
  })

  it('throws MigrationError wrapping the cause on non-rejection failures', async () => {
    waitForTransactionMock.mockRejectedValueOnce(new Error('rpc broke'))

    await expect(runExecute()).rejects.toSatisfy(
      (e) => e instanceof Error && e.name === 'MigrationError',
    )
  })

  it('rejects smart-account signers', async () => {
    const plan = await buildMigrationPlan({
      domains: [unwrappedDomain('alice')],
      migrationOwner: OWNER,
      wagmiConfig: WAGMI,
      publicClient: PUBLIC_CLIENT,
      preflight: DEFAULT_PREFLIGHT,
    })

    await expect(
      executeMigration({
        plan,
        wagmiConfig: WAGMI,
        publicClient: PUBLIC_CLIENT,
        signer: { type: 'zerodev' } as unknown as Signer,
        accountAddress: OWNER,
        onProgress: () => {},
      }),
    ).rejects.toSatisfy(
      (e) => e instanceof Error && e.name === 'MigrationError',
    )
    expect(waitForTransactionMock).not.toHaveBeenCalled()
  })

  it('ineligible names are returned and not counted as completed', async () => {
    const bad = makeDomain({
      id: 'bad',
      name: 'bad.eth',
      labelName: 'bad',
      isWrapped: true,
      wrappedOwnerId: OWNER,
      fuses: 1 | 4,
    })
    const good = unwrappedDomain('good')
    const { result } = await runExecute({ domains: [bad, good] })

    expect(result.completed).toBe(1)
    expect(result.ineligible.map((n) => n.domain.id)).toEqual(['bad'])
  })
})
