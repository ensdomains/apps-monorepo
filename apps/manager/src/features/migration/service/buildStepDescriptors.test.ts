import type { Address, Hex } from 'viem'
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
  namesByBatch.map(
    (names) =>
      ({
        names,
        operations: names.map((name) => ({ name, action: 'migrate' })),
      }) as unknown as AtomicMigrationBatch,
  )

/** A batch whose names carry an opted-in manager, keyed name -> grantee. */
const batchWithManagers = (
  managersByName: Readonly<Record<string, Address | null>>,
): AtomicMigrationBatch => {
  const names = Object.keys(managersByName)
  return {
    names,
    operations: names.map((name) => ({ name, action: 'migrate' })),
    nameExecutions: names.map((name) => ({
      classified: {
        action: 'migrate',
        domain: { name },
        managerAddress: managersByName[name] ?? null,
      },
    })),
  } as unknown as AtomicMigrationBatch
}

const registrationApprovalTargets = (
  ...targets: readonly (readonly [tokenId: bigint, name: string])[]
) => targets.map(([tokenId, name]) => ({ name, tokenId }))

describe('buildStepDescriptors', () => {
  it('uses three successful-path steps for one unwrapped name and a fresh HCA', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: true,
        approvals: [tokenApproval()],
        atomicBatches: batches(['alice.eth']),
        registrationApprovalTargets: registrationApprovalTargets([
          1n,
          'alice.eth',
        ]),
      }),
    ).toEqual([
      { type: 'deploy-hca' },
      {
        type: 'approval',
        approvalId: 'base-registrar:hca-token',
        name: 'alice.eth',
        tokenId: 1n,
      },
      {
        type: 'atomic-batch',
        index: 0,
        total: 1,
        count: 1,
        migrateCount: 1,
        copyCount: 0,
        roleGrants: [],
      },
    ])
  })

  it('keeps the reusable helper approval for a wrapped selection', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals: [operatorApproval('name-wrapper:hca')],
        atomicBatches: batches(['alice.eth', 'bob.eth']),
        registrationApprovalTargets: [],
      }),
    ).toEqual([
      { type: 'approval', approvalId: 'name-wrapper:hca', count: undefined },
      {
        type: 'atomic-batch',
        index: 0,
        total: 1,
        count: 2,
        migrateCount: 2,
        copyCount: 0,
        roleGrants: [],
      },
    ])
  })

  it('uses one step when the HCA and required permissions already exist', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals: [],
        atomicBatches: batches(['alice.eth']),
        registrationApprovalTargets: [],
      }),
    ).toEqual([
      {
        type: 'atomic-batch',
        index: 0,
        total: 1,
        count: 1,
        migrateCount: 1,
        copyCount: 0,
        roleGrants: [],
      },
    ])
  })

  it('adds and removes a temporary manager approval around the migration batch', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals: [operatorApproval('eth-registry:hca')],
        atomicBatches: batches(['alice.eth']),
        registrationApprovalTargets: [],
      }),
    ).toEqual([
      {
        type: 'approval',
        approvalId: 'eth-registry:hca',
        count: undefined,
        roleGrants: undefined,
      },
      {
        type: 'atomic-batch',
        index: 0,
        total: 1,
        count: 1,
        migrateCount: 1,
        copyCount: 0,
        roleGrants: [],
      },
      { type: 'cleanup', approvalId: 'eth-registry:hca' },
    ])
  })

  it('adds one atomic step for every extra gas batch', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals: [],
        atomicBatches: batches(['alice.eth'], ['bob.eth']),
        registrationApprovalTargets: [],
      }),
    ).toEqual([
      {
        type: 'atomic-batch',
        index: 0,
        total: 2,
        count: 1,
        migrateCount: 1,
        copyCount: 0,
        roleGrants: [],
      },
      {
        type: 'atomic-batch',
        index: 1,
        total: 2,
        count: 1,
        migrateCount: 1,
        copyCount: 0,
        roleGrants: [],
      },
    ])
  })

  it('groups setup and final batch + cleanup into one confirmation each when the wallet bundles', () => {
    const descriptors = buildStepDescriptors({
      hcaDeploymentRequired: true,
      approvals: [tokenApproval(), operatorApproval('eth-registry:hca')],
      atomicBatches: batches(['alice.eth'], ['bob.eth']),
      registrationApprovalTargets: [],
      canBatchAtomically: true,
    })

    expect(descriptors.map(({ type }) => type)).toEqual([
      'bundle',
      'atomic-batch',
      'bundle',
    ])
    expect(descriptors[0]).toMatchObject({
      steps: [
        { type: 'deploy-hca' },
        { type: 'approval', approvalId: 'base-registrar:hca-token' },
        { type: 'approval', approvalId: 'eth-registry:hca' },
      ],
    })
    expect(descriptors[2]).toMatchObject({
      steps: [
        { type: 'atomic-batch', index: 1 },
        { type: 'cleanup', approvalId: 'eth-registry:hca' },
      ],
    })
  })

  it('leaves a lone step unwrapped when the wallet bundles', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals: [operatorApproval('base-registrar:hca')],
        atomicBatches: batches(['alice.eth']),
        registrationApprovalTargets: [],
        canBatchAtomically: true,
      }).map(({ type }) => type),
    ).toEqual(['approval', 'atomic-batch'])
  })

  it('keeps a cleanup-only retry as its own confirmation when the wallet bundles', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals: [operatorApproval('eth-registry:hca')],
        atomicBatches: [],
        registrationApprovalTargets: [],
        canBatchAtomically: true,
      }).map(({ type }) => type),
    ).toEqual(['approval', 'cleanup'])
  })

  it('returns no descriptors when there is no work', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals: [],
        atomicBatches: [],
        registrationApprovalTargets: [],
      }),
    ).toEqual([])
  })

  it('labels repeated token approvals with their registration names', () => {
    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals: [tokenApproval(1n), tokenApproval(2n)],
        atomicBatches: batches(['alice.eth', 'bob.eth']),
        registrationApprovalTargets: registrationApprovalTargets(
          [1n, 'alice.eth'],
          [2n, 'bob.eth'],
        ),
      }),
    ).toEqual([
      {
        type: 'approval',
        approvalId: 'base-registrar:hca-token',
        name: 'alice.eth',
        tokenId: 1n,
      },
      {
        type: 'approval',
        approvalId: 'base-registrar:hca-token',
        name: 'bob.eth',
        tokenId: 2n,
      },
      {
        type: 'atomic-batch',
        index: 0,
        total: 1,
        count: 2,
        migrateCount: 2,
        copyCount: 0,
        roleGrants: [],
      },
    ])
  })

  it('reports migrate and copy counts separately for confirmation UI', () => {
    const batch = {
      names: ['example.eth', 'foo.example.eth'],
      operations: [
        { name: 'example.eth', action: 'migrate' },
        { name: 'foo.example.eth', action: 'copy' },
      ],
    } as unknown as AtomicMigrationBatch

    expect(
      buildStepDescriptors({
        hcaDeploymentRequired: false,
        approvals: [],
        atomicBatches: [batch],
        registrationApprovalTargets: [],
      }),
    ).toEqual([
      {
        type: 'atomic-batch',
        index: 0,
        total: 1,
        count: 2,
        migrateCount: 1,
        copyCount: 1,
        roleGrants: [],
      },
    ])
  })
})

describe('buildStepDescriptors role grants (WEB-1528)', () => {
  const MANAGER = '0x0000000000000000000000000000000000000099' as Address

  it('names every account the batch grants a role to', () => {
    const [descriptor] = buildStepDescriptors({
      hcaDeploymentRequired: false,
      approvals: [],
      atomicBatches: [batchWithManagers({ 'alice.eth': MANAGER })],
      registrationApprovalTargets: [],
    })

    expect(descriptor).toMatchObject({
      type: 'atomic-batch',
      roleGrants: [
        { name: 'alice.eth', account: MANAGER, role: 'set-resolver' },
      ],
    })
  })

  it('lists no grantee for names without an opted-in manager', () => {
    const [descriptor] = buildStepDescriptors({
      hcaDeploymentRequired: false,
      approvals: [],
      atomicBatches: [
        batchWithManagers({ 'alice.eth': null, 'bob.eth': MANAGER }),
      ],
      registrationApprovalTargets: [],
    })

    expect(descriptor).toMatchObject({
      type: 'atomic-batch',
      roleGrants: [{ name: 'bob.eth', account: MANAGER }],
    })
  })

  it('tells the enabling approval what it will be spent on', () => {
    const descriptors = buildStepDescriptors({
      hcaDeploymentRequired: false,
      approvals: [operatorApproval('eth-registry:hca')],
      atomicBatches: [batchWithManagers({ 'alice.eth': MANAGER })],
      registrationApprovalTargets: [],
    })

    expect(descriptors[0]).toMatchObject({
      type: 'approval',
      approvalId: 'eth-registry:hca',
      roleGrants: [{ name: 'alice.eth', account: MANAGER }],
    })
  })

  it('never advertises grants on an approval whose plan carries none', () => {
    // A resumed run with no recorded opt-in still plans the approval; it must
    // not then claim to restore managers it will not restore.
    const descriptors = buildStepDescriptors({
      hcaDeploymentRequired: false,
      approvals: [operatorApproval('eth-registry:hca')],
      atomicBatches: [batchWithManagers({ 'alice.eth': null })],
      registrationApprovalTargets: [],
    })

    expect(descriptors[0]).toMatchObject({
      type: 'approval',
      approvalId: 'eth-registry:hca',
      roleGrants: undefined,
    })
  })

  it('leaves unrelated approvals without a grantee list', () => {
    const descriptors = buildStepDescriptors({
      hcaDeploymentRequired: false,
      approvals: [operatorApproval('name-wrapper:hca')],
      atomicBatches: [batchWithManagers({ 'alice.eth': MANAGER })],
      registrationApprovalTargets: [],
    })

    expect(descriptors[0]).toMatchObject({
      type: 'approval',
      approvalId: 'name-wrapper:hca',
      roleGrants: undefined,
    })
  })
})

describe('buildStepDescriptors owner-wallet record replay', () => {
  const replayExecution = (name: string) => ({
    phase: 'profile-replay' as const,
    name,
    names: [name],
    call: { to: CONTRACT, data: '0x' as Hex, value: 0n },
    innerCalls: ['0x' as Hex],
  })

  const batchWithReplays = (
    names: readonly string[],
    replayNames: readonly string[],
  ): AtomicMigrationBatch =>
    ({
      names,
      operations: names.map((name) => ({ name, action: 'migrate' })),
      nameExecutions: names.map((name) => ({
        classified: {
          action: 'migrate',
          domain: { name },
          managerAddress: null,
        },
        walletExecutions: replayNames.includes(name)
          ? [replayExecution(name)]
          : [],
      })),
      walletCall: { to: CONTRACT, data: '0x' as Hex, value: 0n },
    }) as unknown as AtomicMigrationBatch

  it('puts the replay step before the batch it feeds', () => {
    const descriptors = buildStepDescriptors({
      hcaDeploymentRequired: false,
      approvals: [],
      atomicBatches: [
        batchWithReplays(['alice.eth'], ['alice.eth']),
        batches(['bob.eth'])[0] as AtomicMigrationBatch,
      ],
      registrationApprovalTargets: [],
    })

    expect(descriptors.map(({ type }) => type)).toEqual([
      'record-replay',
      'atomic-batch',
      'atomic-batch',
    ])
    expect(descriptors[0]).toMatchObject({ index: 0, count: 1 })
    expect(descriptors[1]).toMatchObject({ type: 'atomic-batch', index: 0 })
  })

  it('counts only the names whose records the replay carries', () => {
    const descriptors = buildStepDescriptors({
      hcaDeploymentRequired: false,
      approvals: [],
      atomicBatches: [
        batchWithReplays(['alice.eth', 'bob.eth'], ['alice.eth']),
      ],
      registrationApprovalTargets: [],
    })

    expect(descriptors[0]).toMatchObject({ type: 'record-replay', count: 1 })
    expect(descriptors[1]).toMatchObject({ type: 'atomic-batch', count: 2 })
  })
})
