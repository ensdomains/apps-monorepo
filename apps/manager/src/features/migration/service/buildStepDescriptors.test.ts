import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import type { AtomicMigrationBatch } from './buildAtomicMigrationBatches'
import { buildStepDescriptors } from './buildStepDescriptors'
import type {
  MigrationApproval,
  MigrationOperatorApprovalId,
} from './migrationApprovals'

const CONTRACT = '0x0000000000000000000000000000000000000001' as Address
const HCA = '0x0000000000000000000000000000000000000002' as Address

const operatorApproval = (
  id: MigrationOperatorApprovalId,
): MigrationApproval => ({
  kind: 'operator',
  id,
  contractAddress: CONTRACT,
  operatorAddress: HCA,
})

const tokenApproval = (tokenId = 1n): MigrationApproval => ({
  kind: 'erc721-token',
  id: 'base-registrar:hca-token',
  contractAddress: CONTRACT,
  operatorAddress: HCA,
  tokenId,
})

const batches = (
  ...namesByBatch: readonly (readonly string[])[]
): readonly AtomicMigrationBatch[] =>
  namesByBatch.map((names) => ({ names }) as AtomicMigrationBatch)

describe('buildStepDescriptors', () => {
  it('uses three successful-path steps for one unwrapped name and a fresh HCA', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: true,
        approvals: [tokenApproval()],
        atomicBatches: batches(['alice.eth']),
      }),
    ).toEqual([
      { type: 'deploy-hca' },
      { type: 'approval', approvalId: 'base-registrar:hca-token' },
      { type: 'atomic-batch', index: 0, total: 1, count: 1 },
    ])
  })

  it('uses two successful-path steps for one unwrapped name and an existing HCA', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals: [tokenApproval()],
        atomicBatches: batches(['alice.eth']),
      }),
    ).toHaveLength(2)
  })

  it('uses three steps for a wrapped selection and an existing HCA', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals: [operatorApproval('name-wrapper:hca')],
        atomicBatches: batches(['alice.eth', 'bob.eth']),
      }),
    ).toEqual([
      { type: 'approval', approvalId: 'name-wrapper:hca' },
      { type: 'atomic-batch', index: 0, total: 1, count: 2 },
      { type: 'cleanup', count: 1 },
    ])
  })

  it('uses one step when the HCA and required permissions already exist', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals: [],
        atomicBatches: batches(['alice.eth']),
      }),
    ).toEqual([{ type: 'atomic-batch', index: 0, total: 1, count: 1 }])
  })

  it('adds manager approval and cleanup around the migration batch', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals: [operatorApproval('eth-registry:hca')],
        atomicBatches: batches(['alice.eth']),
      }),
    ).toEqual([
      { type: 'approval', approvalId: 'eth-registry:hca' },
      { type: 'atomic-batch', index: 0, total: 1, count: 1 },
      { type: 'cleanup', count: 1 },
    ])
  })

  it('adds one atomic step for every extra gas batch', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals: [],
        atomicBatches: batches(['alice.eth'], ['bob.eth']),
      }),
    ).toEqual([
      { type: 'atomic-batch', index: 0, total: 2, count: 1 },
      { type: 'atomic-batch', index: 1, total: 2, count: 1 },
    ])
  })

  it('uses the confirmed ledger count when execution supplies one', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals: [operatorApproval('name-wrapper:hca')],
        atomicBatches: [],
        cleanupApprovalCount: 0,
      }),
    ).toEqual([{ type: 'approval', approvalId: 'name-wrapper:hca' }])
  })

  it('returns no descriptors when there is no work', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals: [],
        atomicBatches: [],
      }),
    ).toEqual([])
  })
})
