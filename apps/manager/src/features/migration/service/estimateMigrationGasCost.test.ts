import type { Call } from '@ens-apps/transaction-manager'
import type { Address, PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import type { MigrationPlan } from './buildMigrationPlan'
import { estimateMigrationGasCost } from './estimateMigrationGasCost'

const account = '0x0000000000000000000000000000000000000001' as Address
const callTarget = '0x0000000000000000000000000000000000000002' as Address

const makeCall = (data: `0x${string}`): Call => ({
  to: callTarget,
  data,
  value: 0n,
})

const makePlan = (overrides: Partial<MigrationPlan> = {}): MigrationPlan =>
  ({
    migrationOwner: account,
    domains: [],
    classified: [],
    ineligible: [],
    groups: {
      unwrapped: [],
      unlocked: [],
      locked2ld: [],
      childNames: new Map(),
    },
    preflight: {
      preExistingOwnedPermRes: null,
      skipApprovalPhase: false,
      skipFetchProfilesPhase: false,
      baseRegistrarApproved: false,
      nameWrapperApproved: false,
    },
    ownedPermRes: null,
    profiles: new Map(),
    migrateCalls: [],
    roleGrantCalls: [],
    profileReplayCalls: [],
    batches: [],
    stepDescriptors: [],
    ...overrides,
  }) as MigrationPlan

const makePublicClient = (estimates: readonly bigint[], fee: bigint) => {
  const estimateGas = vi.fn()
  for (const estimate of estimates) estimateGas.mockResolvedValueOnce(estimate)
  return {
    estimateGas,
    estimateFeesPerGas: vi.fn().mockResolvedValue({ maxFeePerGas: fee }),
  } as unknown as PublicClient
}

describe('estimateMigrationGasCost', () => {
  it('uses predicted approval gas and planned migrate batch gas without live estimateGas', async () => {
    const publicClient = makePublicClient([], 3n)
    const plan = makePlan({
      stepDescriptors: [
        { type: 'approve-base-registrar' },
        { type: 'migrate-batch', index: 0, total: 1, count: 1 },
      ],
      migrateCalls: [makeCall('0x1234')],
      batches: [{ index: 0, names: ['name.eth'], estimatedGas: 100n }],
    })

    const estimate = await estimateMigrationGasCost({
      plan,
      publicClient,
      account,
    })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    expect(estimate.gasUnits).toBe(55_100n)
    expect(estimate.feeWei).toBe(165_300n)
    expect(estimate.transactionCount).toBe(2)
    expect(publicClient.estimateGas).not.toHaveBeenCalled()
  })

  it('includes predicted resolver setup and profile replay gas', async () => {
    const publicClient = makePublicClient([], 2n)
    const plan = makePlan({
      stepDescriptors: [
        { type: 'ensure-resolver' },
        { type: 'profile-replay-batch', index: 0, total: 1 },
      ],
      profileReplayCalls: [makeCall('0xabcd')],
    })

    const estimate = await estimateMigrationGasCost({
      plan,
      publicClient,
      account,
    })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    expect(estimate.gasUnits).toBe(280_000n)
    expect(estimate.transactionCount).toBe(2)
    expect(publicClient.estimateGas).not.toHaveBeenCalled()
  })

  it('sums planned migration gas with predicted role grant and profile replay gas', async () => {
    const publicClient = makePublicClient([], 4n)
    const plan = makePlan({
      migrateCalls: [makeCall('0x1111')],
      batches: [{ index: 0, names: ['name.eth'], estimatedGas: 10n }],
      roleGrantCalls: [makeCall('0x2222')],
      profileReplayCalls: [makeCall('0x3333')],
    })

    const estimate = await estimateMigrationGasCost({
      plan,
      publicClient,
      account,
    })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    expect(estimate.gasUnits).toBe(140_010n)
    expect(estimate.feeWei).toBe(560_040n)
    expect(estimate.transactionCount).toBe(3)
    expect(publicClient.estimateGas).not.toHaveBeenCalled()
  })

  it('falls back to gasPrice when maxFeePerGas is unavailable', async () => {
    const estimateGas = vi.fn()
    const publicClient = {
      estimateGas,
      estimateFeesPerGas: vi.fn().mockResolvedValue({ gasPrice: 7n }),
    } as unknown as PublicClient
    const plan = makePlan({
      migrateCalls: [makeCall('0x1234')],
      batches: [{ index: 0, names: ['name.eth'], estimatedGas: 10n }],
    })

    const estimate = await estimateMigrationGasCost({
      plan,
      publicClient,
      account,
    })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    expect(estimate.feeWei).toBe(70n)
    expect(estimateGas).not.toHaveBeenCalled()
  })

  it('does not simulate migration previews that depend on pending approvals', async () => {
    const publicClient = {
      estimateGas: vi.fn(),
      estimateFeesPerGas: vi.fn().mockResolvedValue({ maxFeePerGas: 2n }),
    } as unknown as PublicClient
    const plan = makePlan({
      stepDescriptors: [{ type: 'approve-base-registrar' }],
      migrateCalls: [makeCall('0x1234')],
      batches: [{ index: 0, names: ['name.eth'], estimatedGas: 100n }],
    })

    const estimate = await estimateMigrationGasCost({
      plan,
      publicClient,
      account,
    })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    expect(estimate.gasUnits).toBe(55_100n)
    expect(estimate.feeWei).toBe(110_200n)
    expect(estimate.transactionCount).toBe(2)
    expect(publicClient.estimateGas).not.toHaveBeenCalled()
  })

  it('returns unavailable when fee estimation fails', async () => {
    const publicClient = {
      estimateGas: vi.fn(),
      estimateFeesPerGas: vi.fn().mockRejectedValueOnce(new Error('rpc down')),
    } as unknown as PublicClient
    const plan = makePlan({ roleGrantCalls: [makeCall('0x1234')] })

    const estimate = await estimateMigrationGasCost({
      plan,
      publicClient,
      account,
    })

    expect(estimate.status).toBe('error')
  })
})
