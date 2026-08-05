import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import type { AtomicMigrationBatch } from './buildAtomicMigrationBatches'
import { buildStepDescriptors } from './buildStepDescriptors'
import type {
  MigrationApproval,
  MigrationApprovalId,
} from './migrationApprovals'

const CONTRACT = '0x0000000000000000000000000000000000000001' as Address
const OPERATOR = '0x0000000000000000000000000000000000000002' as Address

const approval = (id: MigrationApprovalId): MigrationApproval => ({
  id,
  contractAddress: CONTRACT,
  operatorAddress: OPERATOR,
})

const batches = (
  ...namesByBatch: readonly (readonly string[])[]
): readonly AtomicMigrationBatch[] =>
  namesByBatch.map((names) => ({ names }) as AtomicMigrationBatch)

describe('buildStepDescriptors', () => {
  it('orders HCA deployment, approvals, atomic batches, and cleanup', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: true,
        approvals: [
          approval('base-registrar:migration-helper'),
          approval('base-registrar:hca'),
        ],
        atomicBatches: batches(['alice.eth', 'bob.eth'], ['c.eth']),
      }),
    ).toEqual([
      { type: 'deploy-hca' },
      {
        type: 'approval',
        approvalId: 'base-registrar:migration-helper',
      },
      { type: 'approval', approvalId: 'base-registrar:hca' },
      { type: 'atomic-batch', index: 0, total: 2, count: 2 },
      { type: 'atomic-batch', index: 1, total: 2, count: 1 },
      { type: 'cleanup', count: 2 },
    ])
  })

  it('omits HCA deployment when the account is already deployed', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals: [],
        atomicBatches: batches(['alice.eth']),
      }),
    ).toEqual([{ type: 'atomic-batch', index: 0, total: 1, count: 1 }])
  })

  it('carries every approval id in plan order', () => {
    const approvals = [
      approval('name-wrapper:migration-helper'),
      approval('name-wrapper:hca'),
      approval('eth-registry:hca'),
    ]

    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals,
        atomicBatches: [],
      }).filter((descriptor) => descriptor.type === 'approval'),
    ).toEqual([
      {
        type: 'approval',
        approvalId: 'name-wrapper:migration-helper',
      },
      { type: 'approval', approvalId: 'name-wrapper:hca' },
      { type: 'approval', approvalId: 'eth-registry:hca' },
    ])
  })

  it('adds cleanup only when temporary approvals are planned', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: true,
        approvals: [],
        atomicBatches: [],
      }),
    ).toEqual([{ type: 'deploy-hca' }])
  })

  it('uses an explicit cleanup count when execution has a confirmed approval ledger', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals: [approval('name-wrapper:hca')],
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
