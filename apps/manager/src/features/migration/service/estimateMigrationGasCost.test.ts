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
  it('estimates only missing approvals from the step descriptors', async () => {
    const publicClient = makePublicClient([10n, 20n], 3n)
    const plan = makePlan({
      stepDescriptors: [
        { type: 'approve-base-registrar' },
        { type: 'migrate-batch', index: 0, total: 1, count: 1 },
      ],
      migrateCalls: [makeCall('0x1234')],
    })

    const estimate = await estimateMigrationGasCost({
      plan,
      publicClient,
      account,
    })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    expect(estimate.gasUnits).toBe(30n)
    expect(estimate.feeWei).toBe(90n)
    expect(estimate.transactionCount).toBe(2)
    expect(publicClient.estimateGas).toHaveBeenCalledTimes(2)
  })

  it('includes resolver setup only when the plan includes that step', async () => {
    const publicClient = makePublicClient([11n, 22n], 2n)
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
    expect(estimate.gasUnits).toBe(33n)
    expect(estimate.transactionCount).toBe(2)
  })

  it('sums migration, role grant, and profile replay calls', async () => {
    const publicClient = makePublicClient([10n, 20n, 30n], 4n)
    const plan = makePlan({
      migrateCalls: [makeCall('0x1111')],
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
    expect(estimate.gasUnits).toBe(60n)
    expect(estimate.feeWei).toBe(240n)
    expect(estimate.transactionCount).toBe(3)
  })

  it('falls back to gasPrice when maxFeePerGas is unavailable', async () => {
    const estimateGas = vi.fn().mockResolvedValueOnce(10n)
    const publicClient = {
      estimateGas,
      estimateFeesPerGas: vi.fn().mockResolvedValue({ gasPrice: 7n }),
    } as unknown as PublicClient
    const plan = makePlan({ migrateCalls: [makeCall('0x1234')] })

    const estimate = await estimateMigrationGasCost({
      plan,
      publicClient,
      account,
    })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    expect(estimate.feeWei).toBe(70n)
  })

  it('uses migrate batch heuristic gas when a migrate simulation depends on pending approvals', async () => {
    const publicClient = {
      estimateGas: vi
        .fn()
        .mockResolvedValueOnce(10n)
        .mockRejectedValueOnce(new Error('not approved')),
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
    expect(estimate.gasUnits).toBe(110n)
    expect(estimate.feeWei).toBe(220n)
    expect(estimate.transactionCount).toBe(2)
  })

  it('returns unavailable when gas estimation fails without a fallback', async () => {
    const publicClient = {
      estimateGas: vi.fn().mockRejectedValueOnce(new Error('revert')),
      estimateFeesPerGas: vi.fn().mockResolvedValue({ maxFeePerGas: 1n }),
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
