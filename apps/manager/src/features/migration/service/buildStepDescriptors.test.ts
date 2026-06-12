import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { makeClassified } from './_fixtures'
import { buildStepDescriptors } from './buildStepDescriptors'
import type { GroupedNames } from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'

const emptyGroups = (): GroupedNames => ({
  unwrapped: [],
  unlocked: [],
  locked2ld: [],
  childNames: new Map(),
})

const preflight = (
  o: Partial<MigrationPreflight> = {},
): MigrationPreflight => ({
  preExistingOwnedPermRes: null,
  skipApprovalPhase: false,
  skipFetchProfilesPhase: false,
  baseRegistrarApproved: false,
  nameWrapperApproved: false,
  ...o,
})

const build = (
  classified: readonly Parameters<typeof makeClassified>[0][] = [{}],
  groups: Partial<GroupedNames> = {},
  p: Partial<MigrationPreflight> = {},
  approvals: {
    hasBaseRegistrarApproval?: boolean
    hasNameWrapperApproval?: boolean
    hasProfileReplay?: boolean
    migrateBatchCount?: number
    profileReplayBatchCount?: number
  } = {},
) =>
  buildStepDescriptors({
    classified: classified.map(makeClassified),
    groups: { ...emptyGroups(), ...groups },
    preflight: preflight(p),
    hasBaseRegistrarApproval: approvals.hasBaseRegistrarApproval ?? false,
    hasNameWrapperApproval: approvals.hasNameWrapperApproval ?? false,
    hasProfileReplay: approvals.hasProfileReplay ?? false,
    migrateBatchCount:
      approvals.migrateBatchCount ?? (classified.length > 0 ? 1 : 0),
    profileReplayBatchCount: approvals.profileReplayBatchCount ?? 1,
  })

describe('buildStepDescriptors', () => {
  const keepV1 = { resolverStrategy: 'keep-v1' as const }

  it('emits only migrate-batch when approval is not needed and no resolver change', () => {
    const d = build([keepV1])
    expect(d).toEqual([{ type: 'migrate-batch', index: 0, total: 1, count: 1 }])
  })

  it('prepends approve-base-registrar when unwrapped names exist and not already approved', () => {
    expect(
      build([keepV1], {
        unwrapped: [makeClassified(keepV1)],
      })[0],
    ).toEqual({ type: 'approve-base-registrar' })
  })

  it('omits approve-base-registrar when already approved', () => {
    const d = build(
      [keepV1],
      { unwrapped: [makeClassified(keepV1)] },
      {},
      { hasBaseRegistrarApproval: true },
    )
    expect(d.find((x) => x.type === 'approve-base-registrar')).toBeUndefined()
  })

  it('prepends approve-name-wrapper when wrapped names exist and not already approved', () => {
    const d = build([keepV1], {
      unlocked: [makeClassified({ tokenType: 'unlocked' })],
    })
    expect(d.find((x) => x.type === 'approve-name-wrapper')).toBeDefined()
  })

  it('omits approve-name-wrapper when already approved', () => {
    const d = build(
      [keepV1],
      { unlocked: [makeClassified({ tokenType: 'unlocked' })] },
      {},
      { hasNameWrapperApproval: true },
    )
    expect(d.find((x) => x.type === 'approve-name-wrapper')).toBeUndefined()
  })

  it('skips all approval steps when skipApprovalPhase is true', () => {
    const d = build(
      [keepV1],
      { unwrapped: [makeClassified(keepV1)] },
      { skipApprovalPhase: true },
    )
    expect(d.find((x) => x.type === 'approve-base-registrar')).toBeUndefined()
    expect(d.find((x) => x.type === 'approve-name-wrapper')).toBeUndefined()
  })

  it.each([
    [
      'adds ensure-resolver when any name needs the owned PermRes',
      [{ resolverStrategy: 'to-owned-permres' as const }],
      {},
      true,
    ],
    [
      'omits ensure-resolver when no name needs the owned PermRes',
      [{ resolverStrategy: 'keep-v1' as const }],
      {},
      false,
    ],
    [
      'omits ensure-resolver when a pre-existing PermRes is supplied',
      [{ resolverStrategy: 'to-owned-permres' as const }],
      {
        preExistingOwnedPermRes:
          '0x0000000000000000000000000000000000000abc' as Address,
      },
      false,
    ],
  ] as const)('%s', (_, classified, pre, present) => {
    const found = build(classified, {}, pre).find(
      (x) => x.type === 'ensure-resolver',
    )
    expect(!!found).toBe(present)
  })

  it('emits grant-role for each name with a managerAddress', () => {
    const withManager = [
      makeClassified({
        label: 'alice',
        managerAddress: '0x1111111111111111111111111111111111111111' as Address,
      }),
      makeClassified({ label: 'bob' }),
    ]
    const d = buildStepDescriptors({
      classified: withManager,
      groups: emptyGroups(),
      preflight: preflight(),
      hasBaseRegistrarApproval: false,
      hasNameWrapperApproval: false,
      hasProfileReplay: false,
      migrateBatchCount: 1,
      profileReplayBatchCount: 0,
    })
    const roles = d.filter((x) => x.type === 'grant-role')
    expect(roles).toEqual([{ type: 'grant-role', label: 'alice' }])
  })

  it('emits a single profile-replay-batch descriptor when hasProfileReplay is true', () => {
    const withPermRes = [
      makeClassified({ label: 'alice', resolverStrategy: 'to-owned-permres' }),
      makeClassified({ label: 'bob', resolverStrategy: 'to-owned-permres' }),
    ]
    const d = buildStepDescriptors({
      classified: withPermRes,
      groups: emptyGroups(),
      preflight: preflight({ preExistingOwnedPermRes: null }),
      hasBaseRegistrarApproval: false,
      hasNameWrapperApproval: false,
      hasProfileReplay: true,
      migrateBatchCount: 1,
      profileReplayBatchCount: 1,
    })
    const replays = d.filter((x) => x.type === 'profile-replay-batch')
    expect(replays).toEqual([
      { type: 'profile-replay-batch', index: 0, total: 1 },
    ])
  })

  it('emits no profile-replay-batch descriptor when hasProfileReplay is false', () => {
    const withPermRes = [
      makeClassified({ label: 'alice', resolverStrategy: 'to-owned-permres' }),
    ]
    const d = buildStepDescriptors({
      classified: withPermRes,
      groups: emptyGroups(),
      preflight: preflight({ preExistingOwnedPermRes: null }),
      hasBaseRegistrarApproval: false,
      hasNameWrapperApproval: false,
      hasProfileReplay: false,
      migrateBatchCount: 1,
      profileReplayBatchCount: 0,
    })
    expect(d.filter((x) => x.type === 'profile-replay-batch')).toEqual([])
  })

  it('orders descriptors as approve-base-registrar → ensure-resolver → migrate-batch → grant-role → profile-replay-batch', () => {
    expect(
      buildStepDescriptors({
        classified: [
          makeClassified({
            label: 'alice',
            resolverStrategy: 'to-owned-permres',
            managerAddress:
              '0x1111111111111111111111111111111111111111' as Address,
          }),
        ],
        groups: { ...emptyGroups(), unwrapped: [makeClassified()] },
        preflight: preflight(),
        hasBaseRegistrarApproval: false,
        hasNameWrapperApproval: false,
        hasProfileReplay: true,
        migrateBatchCount: 1,
        profileReplayBatchCount: 1,
      }).map((d) => d.type),
    ).toEqual([
      'approve-base-registrar',
      'ensure-resolver',
      'migrate-batch',
      'grant-role',
      'profile-replay-batch',
    ])
  })

  it('returns no descriptors for an empty classified list', () => {
    expect(
      buildStepDescriptors({
        classified: [],
        groups: emptyGroups(),
        preflight: preflight(),
        hasBaseRegistrarApproval: false,
        hasNameWrapperApproval: false,
        hasProfileReplay: false,
        migrateBatchCount: 0,
        profileReplayBatchCount: 0,
      }),
    ).toEqual([])
  })
})

const owner = '0x0000000000000000000000000000000000000001' as Address

const c = (
  label: string,
  managed = false,
): Parameters<typeof makeClassified>[0] => ({
  label,
  resolverStrategy: 'to-owned-permres' as const,
  managerAddress: managed ? owner : null,
})

describe('buildStepDescriptors (batched)', () => {
  it('emits one migrate-batch descriptor per batch', () => {
    const classified = [c('a'), c('b')].map(makeClassified)
    const descriptors = buildStepDescriptors({
      classified,
      groups: {
        unwrapped: classified,
        unlocked: [],
        locked2ld: [],
        childNames: new Map(),
      } as never,
      preflight: {
        skipApprovalPhase: true,
        preExistingOwnedPermRes: null,
        skipFetchProfilesPhase: false,
      } as never,
      hasBaseRegistrarApproval: true,
      hasNameWrapperApproval: true,
      hasProfileReplay: false,
      migrateBatchCount: 3,
      profileReplayBatchCount: 0,
    })
    const batchDescs = descriptors.filter((d) => d.type === 'migrate-batch')
    expect(batchDescs).toHaveLength(3)
    expect(batchDescs[0]).toMatchObject({ index: 0, total: 3 })
    expect(batchDescs[2]).toMatchObject({ index: 2, total: 3 })
  })

  it('emits one profile-replay-batch descriptor per batch', () => {
    const classified = [c('a')].map(makeClassified)
    const descriptors = buildStepDescriptors({
      classified,
      groups: {
        unwrapped: classified,
        unlocked: [],
        locked2ld: [],
        childNames: new Map(),
      } as never,
      preflight: {
        skipApprovalPhase: true,
        preExistingOwnedPermRes: null,
        skipFetchProfilesPhase: false,
      } as never,
      hasBaseRegistrarApproval: true,
      hasNameWrapperApproval: true,
      hasProfileReplay: true,
      migrateBatchCount: 1,
      profileReplayBatchCount: 2,
    })
    const replays = descriptors.filter((d) => d.type === 'profile-replay-batch')
    expect(replays).toHaveLength(2)
  })

  it('emits per-name grant-role descriptors for managed names', () => {
    const classified = [c('a', true), c('b', true), c('c')].map(makeClassified)
    const descriptors = buildStepDescriptors({
      classified,
      groups: {
        unwrapped: classified,
        unlocked: [],
        locked2ld: [],
        childNames: new Map(),
      } as never,
      preflight: {
        skipApprovalPhase: true,
        preExistingOwnedPermRes: null,
        skipFetchProfilesPhase: false,
      } as never,
      hasBaseRegistrarApproval: true,
      hasNameWrapperApproval: true,
      hasProfileReplay: false,
      migrateBatchCount: 1,
      profileReplayBatchCount: 0,
    })
    const grants = descriptors.filter((d) => d.type === 'grant-role')
    expect(grants).toHaveLength(2)
  })
})
