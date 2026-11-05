import { buildStandaloneHcaDeploymentCall } from '@ens-apps/smart-account'
import { type Address, type Hex, isAddressEqual, type PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import { labelhash } from 'viem/ens'
import { describe, expect, it, vi } from 'vitest'
import type { AtomicMigrationBatch } from './buildAtomicMigrationBatches'
import type { MigrationPlan } from './buildMigrationPlan'
import type { ClassifiedName } from './classifyNames'
import { estimateMigrationGasCost } from './estimateMigrationGasCost'
import type {
  MigrationApproval,
  MigrationOperatorApprovalId,
} from './migrationApprovals'
import {
  buildMigrationApprovalCall,
  planMigrationApprovals,
  prepareMigrationApprovals,
  temporaryMigrationHcaApproval,
} from './migrationApprovals'

const account = '0x0000000000000000000000000000000000000001' as Address
const contract = '0x0000000000000000000000000000000000000002' as Address
const deploymentCall = buildStandaloneHcaDeploymentCall({
  chainId: sepolia.id,
  owner: account,
})
const DEPLOYMENT_ESTIMATE = 578_000n
const APPROVAL_ESTIMATE = 130_000n

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

const tokenIdOf = (label: string): bigint => BigInt(labelhash(label))

const unwrappedGroups = (...labels: string[]): MigrationPlan['groups'] => ({
  unwrapped: labels.map((label) => ({ label }) as ClassifiedName),
  unlocked: [],
  locked2ld: [],
  childNames: new Map(),
})

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

const makePublicClient = (
  fee: {
    readonly maxFeePerGas?: bigint
    readonly gasPrice?: bigint
  },
  revertingData?: Hex,
): PublicClient =>
  ({
    chain: sepolia,
    estimateGas: vi.fn(
      ({ to, data }: { readonly to: Address; readonly data: Hex }) =>
        data === revertingData
          ? Promise.reject(new Error('execution reverted'))
          : Promise.resolve(
              isAddressEqual(to, deploymentCall.to)
                ? DEPLOYMENT_ESTIMATE
                : APPROVAL_ESTIMATE,
            ),
    ),
    estimateFeesPerGas: vi.fn().mockResolvedValue(fee),
    getGasPrice: vi.fn().mockResolvedValue(9n),
  }) as unknown as PublicClient

describe('estimateMigrationGasCost', () => {
  it('budgets six requests with revocations left to the permissions page', async () => {
    const tokenIds = Array.from({ length: 79 }, (_, index) => BigInt(index + 1))
    const tokenApprovals = planMigrationApprovals({
      hcaAddress: account,
      needs: {
        hasUnwrapped: true,
        unwrappedTokenIds: tokenIds,
        hasWrapped: true,
        requiresManagerRestoration: true,
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
    const approvals = prepareMigrationApprovals({
      approvals: tokenApprovals,
      hcaAddress: account,
      canBatchAtomically: false,
    })
    const estimate = await estimateMigrationGasCost({
      plan: makePlan({
        hcaDeploymentRequired: true,
        preflight: {
          skipFetchProfilesPhase: true,
          migrationApprovals: approvals,
        },
        atomicBatches: Array.from({ length: 2 }, () => makeAtomicBatch(100n)),
      }),
      publicClient: makePublicClient({ maxFeePerGas: 1n }),
    })
    expect(estimate).toEqual({
      status: 'ready',
      transactionCount: 6,
      gasUnits: DEPLOYMENT_ESTIMATE + 3n * APPROVAL_ESTIMATE + 200n,
      feeWei: DEPLOYMENT_ESTIMATE + 3n * APPROVAL_ESTIMATE + 200n,
      feePerGasWei: 1n,
    })
  })

  it('counts three confirmations for a fresh HCA and one unwrapped name', async () => {
    const publicClient = makePublicClient({ maxFeePerGas: 3n })
    const approval = makeTokenApproval(tokenIdOf('alice'))
    const plan = makePlan({
      hcaDeploymentRequired: true,
      groups: unwrappedGroups('alice'),
      preflight: {
        skipFetchProfilesPhase: true,
        migrationApprovals: [approval],
      },
      atomicBatches: [makeAtomicBatch(100n)],
    })

    const estimate = await estimateMigrationGasCost({ plan, publicClient })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    // The ERC-721 approval clears automatically when the registration transfers.
    const gasUnits = DEPLOYMENT_ESTIMATE + APPROVAL_ESTIMATE + 100n
    expect(estimate.gasUnits).toBe(gasUnits)
    expect(estimate.feeWei).toBe(gasUnits * 3n)
    expect(estimate.transactionCount).toBe(3)
    // The owner's estimates of the exact calls the setup sends.
    expect(publicClient.estimateGas).toHaveBeenCalledTimes(2)
    expect(publicClient.estimateGas).toHaveBeenCalledWith({
      account,
      ...deploymentCall,
    })
    expect(publicClient.estimateGas).toHaveBeenCalledWith({
      account,
      ...buildMigrationApprovalCall(approval),
    })
  })

  it('skips the token approvals of names a partial recovery already migrated', async () => {
    const migrated = makeTokenApproval(tokenIdOf('migrated'))
    // The owner no longer holds the migrated token, so its approve reverts.
    const publicClient = makePublicClient(
      { maxFeePerGas: 1n },
      buildMigrationApprovalCall(migrated).data,
    )
    const plan = makePlan({
      groups: unwrappedGroups('remaining'),
      preflight: {
        skipFetchProfilesPhase: true,
        migrationApprovals: [
          migrated,
          makeTokenApproval(tokenIdOf('remaining')),
        ],
      },
      atomicBatches: [makeAtomicBatch(100n)],
    })

    const estimate = await estimateMigrationGasCost({ plan, publicClient })

    expect(estimate.status).toBe('ready')
    if (estimate.status !== 'ready') throw new Error('expected ready estimate')
    expect(estimate.gasUnits).toBe(APPROVAL_ESTIMATE + 100n)
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
    expect(estimate.gasUnits).toBe(APPROVAL_ESTIMATE + 100n)
    expect(estimate.transactionCount).toBe(2)
  })

  it('budgets the manager restoration grant without required cleanup', async () => {
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
    expect(manager.transactionCount - base.transactionCount).toBe(1)
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
