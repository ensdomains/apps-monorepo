import type { Address, PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import type { AtomicMigrationBatch } from './buildAtomicMigrationBatches'
import type { MigrationPlan } from './buildMigrationPlan'
import { estimateMigrationGasCost } from './estimateMigrationGasCost'
import type {
  MigrationApproval,
  MigrationOperatorApprovalId,
} from './migrationApprovals'
import {
  planMigrationApprovalPreflight,
  temporaryMigrationHcaApproval,
} from './migrationApprovals'

const account = '0x0000000000000000000000000000000000000001' as Address
const contract = '0x0000000000000000000000000000000000000002' as Address

const makeOperatorApproval = (
  id: MigrationOperatorApprovalId,
): MigrationApproval => ({
  kind: 'operator',
  id,
  contractAddress: contract,
  operatorAddress: account,
})

const makeTokenApproval = (tokenId = 1n): MigrationApproval => ({
  kind: 'erc721-token',
  id: 'base-registrar:hca-token',
  contractAddress: contract,
  operatorAddress: account,
  tokenId,
})

const makeAtomicBatch = (
  estimatedGas: bigint,
  walletEstimatedGas = 0n,
): AtomicMigrationBatch =>
  ({
    estimatedGas,
    walletEstimatedGas,
    walletCall:
      walletEstimatedGas === 0n
        ? null
        : { to: contract, data: '0x', value: 0n },
  }) as AtomicMigrationBatch

const makePlan = (overrides: Partial<MigrationPlan> = {}): MigrationPlan =>
  ({
    hcaAddress: contract,
    hcaDeploymentRequired: false,
    migrationOwner: account,
    classified: [],
    ineligible: [],
    groups: {
      unwrapped: [],
      unlocked: [],
      locked2ld: [],
      childNames: new Map(),
    },
    preflight: {
      skipFetchProfilesPhase: true,
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
  it.each([
    {
      count: 1,
      hasWrapped: false,
      hasManagers: false,
      batches: 1,
      requests: 4,
      gasUnits: 560_100n,
    },
    {
      count: 2,
      hasWrapped: false,
      hasManagers: false,
      batches: 1,
      requests: 4,
      gasUnits: 560_100n,
    },
    {
      count: 79,
      hasWrapped: true,
      hasManagers: true,
      batches: 2,
      requests: 8,
      gasUnits: 725_200n,
    },
  ])(
    'budgets $requests requests including cleanup for $count unwrapped names',
    async ({ count, hasWrapped, hasManagers, batches, requests, gasUnits }) => {
      const tokenIds = Array.from({ length: count }, (_, index) =>
        BigInt(index + 1),
      )
      const approvals = planMigrationApprovalPreflight({
        hcaAddress: account,
        registrationApprovalPolicy: 'temporary-operator',
        needs: {
          hasUnwrapped: true,
          unwrappedTokenIds: tokenIds,
          hasWrapped,
          requiresManagerRestoration: hasManagers,
        },
        status: {
          baseRegistrarHcaApproved: false,
          unwrappedTokenApprovals: tokenIds.map((tokenId) => ({
            tokenId,
            approved: false,
          })),
          nameWrapperHcaApproved: false,
          ethRegistryHcaApproved: false,
        },
      })
      const estimate = await estimateMigrationGasCost({
        plan: makePlan({
          hcaDeploymentRequired: true,
          preflight: { skipFetchProfilesPhase: true, ...approvals },
          atomicBatches: Array.from({ length: batches }, () =>
            makeAtomicBatch(100n),
          ),
        }),
        publicClient: makePublicClient({ maxFeePerGas: 1n }),
      })
      expect(estimate).toEqual({
        status: 'ready',
        transactionCount: requests,
        gasUnits,
        feeWei: gasUnits,
        feePerGasWei: 1n,
      })
    },
  )

  it('counts three confirmations for a fresh HCA and one unwrapped name', async () => {
    const publicClient = makePublicClient({ maxFeePerGas: 3n })
    const plan = makePlan({
      hcaDeploymentRequired: true,
      preflight: {
        skipFetchProfilesPhase: true,
        migrationApprovals: [makeTokenApproval()],
      },
      atomicBatches: [makeAtomicBatch(100n)],
    })

    const estimate = await estimateMigrationGasCost({ plan, publicClient })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    // 450k deployment + 55k token approval + 100 batch gas. The ERC-721
    // approval clears automatically when the registration transfers.
    expect(estimate.gasUnits).toBe(505_100n)
    expect(estimate.feeWei).toBe(1_515_300n)
    expect(estimate.transactionCount).toBe(3)
    expect(publicClient.estimateGas).not.toHaveBeenCalled()
  })

  it('counts one confirmation for an existing HCA with permissions', async () => {
    const publicClient = makePublicClient({ maxFeePerGas: 4n })
    const plan = makePlan({
      atomicBatches: [makeAtomicBatch(111n)],
    })

    const estimate = await estimateMigrationGasCost({ plan, publicClient })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    expect(estimate.gasUnits).toBe(111n)
    expect(estimate.feeWei).toBe(444n)
    expect(estimate.transactionCount).toBe(1)
  })

  it('counts one persistent grant for a missing wrapped operator approval', async () => {
    const publicClient = makePublicClient({ maxFeePerGas: 2n })
    const plan = makePlan({
      preflight: {
        skipFetchProfilesPhase: true,
        migrationApprovals: [makeOperatorApproval('name-wrapper:hca')],
      },
      atomicBatches: [makeAtomicBatch(100n)],
    })

    const estimate = await estimateMigrationGasCost({ plan, publicClient })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    expect(estimate.gasUnits).toBe(55_100n)
    expect(estimate.transactionCount).toBe(2)
  })

  it('budgets both manager restoration grant and cleanup', async () => {
    const publicClient = makePublicClient({ maxFeePerGas: 2n })
    const basePlan = makePlan({ atomicBatches: [makeAtomicBatch(100n)] })
    const managerPlan = makePlan({
      preflight: {
        ...basePlan.preflight,
        migrationApprovals: [makeOperatorApproval('eth-registry:hca')],
        migrationCleanupApprovals: [temporaryMigrationHcaApproval(account)],
      },
      atomicBatches: [makeAtomicBatch(100n)],
    })

    const base = await estimateMigrationGasCost({
      plan: basePlan,
      publicClient,
    })
    const manager = await estimateMigrationGasCost({
      plan: managerPlan,
      publicClient,
    })

    expect(base.status).toBe('ready')
    expect(manager.status).toBe('ready')
    if (base.status !== 'ready' || manager.status !== 'ready') {
      throw new Error('expected ready estimates')
    }
    expect(manager.transactionCount - base.transactionCount).toBe(2)
  })

  it('every additional atomic batch adds one confirmation', async () => {
    const publicClient = makePublicClient({ maxFeePerGas: 2n })
    const plan = makePlan({
      atomicBatches: [makeAtomicBatch(100n), makeAtomicBatch(200n)],
    })

    const estimate = await estimateMigrationGasCost({ plan, publicClient })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    expect(estimate.transactionCount).toBe(2)
  })

  it('counts the owner-wallet record replay as its own transaction', async () => {
    const publicClient = makePublicClient({ maxFeePerGas: 2n })
    const plan = makePlan({
      atomicBatches: [makeAtomicBatch(100n, 40n)],
    })

    const estimate = await estimateMigrationGasCost({ plan, publicClient })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    // The wallet pays for the replay as well as the batch itself.
    expect(estimate.gasUnits).toBe(140n)
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
