import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { makeClassified } from './_fixtures'
import {
  buildStepDescriptors,
  MAX_NAMES_PER_BATCH,
  needsSCAApproval,
} from './buildStepDescriptors'
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
  ...o,
})

const build = (
  classified: readonly Parameters<typeof makeClassified>[0][] = [{}],
  groups: Partial<GroupedNames> = {},
  p: Partial<MigrationPreflight> = {},
) =>
  buildStepDescriptors(
    classified.map(makeClassified),
    { ...emptyGroups(), ...groups },
    preflight(p),
  )

describe('needsSCAApproval', () => {
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
    expect(needsSCAApproval(groups)).toBe(expected)
  })
})

describe('buildStepDescriptors', () => {
  const keepV1 = { resolverStrategy: 'keep-v1' as const }

  it('emits only batch steps when approval is not needed and no resolver change', () => {
    expect(build([keepV1])).toEqual([
      { type: 'migrate-batch', batch: 1, totalBatches: 1, count: 1 },
    ])
  })

  it('prepends approve-sca when approval is required and not skipped', () => {
    expect(
      build([keepV1], {
        unwrapped: [makeClassified(keepV1)],
      })[0],
    ).toEqual({ type: 'approve-sca', count: 1 })
  })

  it('skips approve-sca when skipApprovalPhase is true', () => {
    const d = build(
      [keepV1],
      { unwrapped: [makeClassified(keepV1)] },
      {
        skipApprovalPhase: true,
      },
    )
    expect(d.find((x) => x.type === 'approve-sca')).toBeUndefined()
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

  it('emits 2 batches at MAX_NAMES_PER_BATCH + 1 with correct counts', () => {
    const batches = build(
      Array.from({ length: MAX_NAMES_PER_BATCH + 1 }, (_, i) => ({
        id: `0x${i}`,
      })),
    ).filter((d) => d.type === 'migrate-batch')
    expect(batches).toEqual([
      {
        type: 'migrate-batch',
        batch: 1,
        totalBatches: 2,
        count: MAX_NAMES_PER_BATCH,
      },
      { type: 'migrate-batch', batch: 2, totalBatches: 2, count: 1 },
    ])
  })

  it('emits exactly 1 batch at MAX_NAMES_PER_BATCH', () => {
    const batches = build(
      Array.from({ length: MAX_NAMES_PER_BATCH }, (_, i) => ({ id: `0x${i}` })),
    ).filter((d) => d.type === 'migrate-batch')
    expect(batches).toHaveLength(1)
    expect(batches[0]).toMatchObject({
      totalBatches: 1,
      count: MAX_NAMES_PER_BATCH,
    })
  })

  it('orders descriptors as approve-sca → ensure-resolver → migrate-batch', () => {
    expect(
      build([{ resolverStrategy: 'to-owned-permres' }], {
        unwrapped: [makeClassified()],
      }).map((d) => d.type),
    ).toEqual(['approve-sca', 'ensure-resolver', 'migrate-batch'])
  })

  it('returns no descriptors for an empty classified list', () => {
    expect(buildStepDescriptors([], emptyGroups(), preflight())).toEqual([])
  })
})
