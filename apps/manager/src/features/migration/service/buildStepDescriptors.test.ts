import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { makeClassified } from './_fixtures'
import { buildStepDescriptors, needsApproval } from './buildStepDescriptors'
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
  } = {},
) =>
  buildStepDescriptors({
    classified: classified.map(makeClassified),
    groups: { ...emptyGroups(), ...groups },
    preflight: preflight(p),
    hasBaseRegistrarApproval: approvals.hasBaseRegistrarApproval ?? false,
    hasNameWrapperApproval: approvals.hasNameWrapperApproval ?? false,
    hasProfileReplay: approvals.hasProfileReplay ?? false,
  })

describe('needsApproval', () => {
  const classified = (tokenType: 'unlocked' | 'locked-2ld' | 'locked-child') =>
    makeClassified({ tokenType })

  it.each([
    ['empty groups', emptyGroups(), false],
    [
      'any unwrapped',
      { ...emptyGroups(), unwrapped: [makeClassified()] },
      true,
    ],
    [
      'any unlocked',
      { ...emptyGroups(), unlocked: [classified('unlocked')] },
      true,
    ],
    [
      'any locked-2ld',
      { ...emptyGroups(), locked2ld: [classified('locked-2ld')] },
      true,
    ],
    [
      'any child parent group',
      {
        ...emptyGroups(),
        childNames: new Map([['raffy.eth', [classified('locked-child')]]]),
      },
      true,
    ],
  ] as const)('returns %s → %s', (_, groups, expected) => {
    expect(needsApproval(groups)).toBe(expected)
  })
})

describe('buildStepDescriptors', () => {
  const keepV1 = { resolverStrategy: 'keep-v1' as const }

  it('emits only migrate-all when approval is not needed and no resolver change', () => {
    expect(build([keepV1])).toEqual([{ type: 'migrate-all', count: 1 }])
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
    })
    const roles = d.filter((x) => x.type === 'grant-role')
    expect(roles).toEqual([{ type: 'grant-role', label: 'alice' }])
  })

  it('emits a single profile-replay descriptor when hasProfileReplay is true', () => {
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
    })
    const replays = d.filter((x) => x.type === 'profile-replay')
    expect(replays).toEqual([{ type: 'profile-replay' }])
  })

  it('emits no profile-replay descriptor when hasProfileReplay is false', () => {
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
    })
    expect(d.filter((x) => x.type === 'profile-replay')).toEqual([])
  })

  it('orders descriptors as approve-base-registrar → ensure-resolver → migrate-all → grant-role → profile-replay', () => {
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
      }).map((d) => d.type),
    ).toEqual([
      'approve-base-registrar',
      'ensure-resolver',
      'migrate-all',
      'grant-role',
      'profile-replay',
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
      }),
    ).toEqual([])
  })
})
