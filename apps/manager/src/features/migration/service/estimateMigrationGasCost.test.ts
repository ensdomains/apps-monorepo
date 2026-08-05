import type { Address, PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import type { AtomicMigrationBatch } from './buildAtomicMigrationBatches'
import type { MigrationPlan } from './buildMigrationPlan'
import { estimateMigrationGasCost } from './estimateMigrationGasCost'
import type {
  MigrationApproval,
  MigrationApprovalId,
} from './migrationApprovals'

const account = '0x0000000000000000000000000000000000000001' as Address
const contract = '0x0000000000000000000000000000000000000002' as Address

const makeApproval = (id: MigrationApprovalId): MigrationApproval => ({
  id,
  contractAddress: contract,
  operatorAddress: account,
})

const makeAtomicBatch = (estimatedGas: bigint): AtomicMigrationBatch =>
  ({ estimatedGas }) as AtomicMigrationBatch

const makePlan = (overrides: Partial<MigrationPlan> = {}): MigrationPlan =>
  ({
    hcaAddress: contract,
    hcaDeploymentRequired: false,
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
      skipApprovalPhase: true,
      skipFetchProfilesPhase: true,
      baseRegistrarApproved: true,
      nameWrapperApproved: true,
      migrationApprovals: [],
    },
    ownedPermRes: null,
    profiles: new Map(),
    atomicBatches: [],
    stepDescriptors: [],
    ...overrides,
  }) as MigrationPlan

const makePublicClient = (fee: {
  readonly maxFeePerGas?: bigint
  readonly gasPrice?: bigint
}): PublicClient =>
  ({
    estimateGas: vi.fn(),
    estimateFeesPerGas: vi.fn().mockResolvedValue(fee),
    getGasPrice: vi.fn().mockResolvedValue(9n),
  }) as unknown as PublicClient

describe('estimateMigrationGasCost', () => {
  it('includes HCA deployment, every approval lifecycle, and all atomic batches', async () => {
    const publicClient = makePublicClient({ maxFeePerGas: 3n })
    const plan = makePlan({
      hcaDeploymentRequired: true,
      preflight: {
        preExistingOwnedPermRes: null,
        skipApprovalPhase: false,
        skipFetchProfilesPhase: true,
        baseRegistrarApproved: false,
        nameWrapperApproved: true,
        migrationApprovals: [
          makeApproval('base-registrar:migration-helper'),
          makeApproval('base-registrar:hca'),
        ],
      },
      atomicBatches: [makeAtomicBatch(100n), makeAtomicBatch(200n)],
    })

    const estimate = await estimateMigrationGasCost({ plan, publicClient })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    // 450k deployment + 2 * (55k grant + 55k cleanup) + 300 batch gas.
    expect(estimate.gasUnits).toBe(670_300n)
    expect(estimate.feeWei).toBe(2_010_900n)
    // Deploy + two grants + two atomic batches + two cleanup revocations.
    expect(estimate.transactionCount).toBe(7)
    expect(publicClient.estimateGas).not.toHaveBeenCalled()
  })

  it('uses only atomic outer estimates for an existing HCA with no temporary approvals', async () => {
    const publicClient = makePublicClient({ maxFeePerGas: 4n })
    const plan = makePlan({
      atomicBatches: [makeAtomicBatch(111n), makeAtomicBatch(222n)],
    })

    const estimate = await estimateMigrationGasCost({ plan, publicClient })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    expect(estimate.gasUnits).toBe(333n)
    expect(estimate.feeWei).toBe(1_332n)
    expect(estimate.transactionCount).toBe(2)
  })

  it('counts one cleanup transaction for every planned temporary approval', async () => {
    const publicClient = makePublicClient({ maxFeePerGas: 2n })
    const plan = makePlan({
      preflight: {
        preExistingOwnedPermRes: null,
        skipApprovalPhase: false,
        skipFetchProfilesPhase: true,
        baseRegistrarApproved: true,
        nameWrapperApproved: false,
        migrationApprovals: [makeApproval('name-wrapper:hca')],
      },
    })

    const estimate = await estimateMigrationGasCost({ plan, publicClient })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    expect(estimate.gasUnits).toBe(110_000n)
    expect(estimate.transactionCount).toBe(2)
  })

  it('falls back to the legacy gas price field', async () => {
    const publicClient = makePublicClient({ gasPrice: 7n })
    const plan = makePlan({
      atomicBatches: [makeAtomicBatch(10n)],
    })

    const estimate = await estimateMigrationGasCost({ plan, publicClient })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    expect(estimate.feeWei).toBe(70n)
  })

  it('falls back to getGasPrice when fee history has neither fee field', async () => {
    const publicClient = makePublicClient({})
    const plan = makePlan({
      atomicBatches: [makeAtomicBatch(10n)],
    })

    const estimate = await estimateMigrationGasCost({ plan, publicClient })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    expect(estimate.feeWei).toBe(90n)
    expect(publicClient.getGasPrice).toHaveBeenCalledOnce()
  })

  it('returns unavailable when fee estimation fails', async () => {
    const publicClient = {
      estimateFeesPerGas: vi.fn().mockRejectedValueOnce(new Error('rpc down')),
    } as unknown as PublicClient

    const estimate = await estimateMigrationGasCost({
      plan: makePlan(),
      publicClient,
    })

    expect(estimate.status).toBe('error')
  })
})
