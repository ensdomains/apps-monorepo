import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  buildStepDescriptors,
  MAX_NAMES_PER_BATCH,
  needsSCAApproval,
} from './buildStepDescriptors'
import type { ClassifiedName, GroupedNames } from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'
import type { V1Domain } from './v1SubgraphClient'

const OWNER: Address = '0x0000000000000000000000000000000000000001'
const RESOLVER: Address = '0x000000000000000000000000000000000000dddd'

type ClassifiedOverrides = {
  tokenType?: ClassifiedName['tokenType']
  parentName?: string | null
  resolverStrategy?: ClassifiedName['resolverStrategy']
  id?: string
}

const makeClassified = (o: ClassifiedOverrides = {}): ClassifiedName => ({
  tokenType: o.tokenType ?? 'unwrapped',
  label: 'alice',
  parentName: o.parentName === undefined ? 'eth' : o.parentName,
  fuses: 0,
  tokenHolder: OWNER,
  v1ResolverAddress: RESOLVER,
  resolverStrategy: o.resolverStrategy ?? 'keep-v1',
  managerAddress: null,
  domain: { id: o.id ?? '0x00' } as unknown as V1Domain,
})

const emptyGroups = (): GroupedNames => ({
  unwrapped: [],
  unlocked: [],
  locked2ld: [],
  childNames: new Map(),
})

const withUnwrapped = (count: number): GroupedNames => ({
  ...emptyGroups(),
  unwrapped: Array.from({ length: count }, () => makeClassified()),
})

const makePreflight = (
  o: Partial<MigrationPreflight> = {},
): MigrationPreflight => ({
  preExistingOwnedPermRes: null,
  skipApprovalPhase: false,
  skipFetchProfilesPhase: false,
  ...o,
})

describe('needsSCAApproval', () => {
  it('returns false for empty groups', () => {
    expect(needsSCAApproval(emptyGroups())).toBe(false)
  })

  it('returns true when any unwrapped exists', () => {
    expect(needsSCAApproval(withUnwrapped(1))).toBe(true)
  })

  it('returns true when any unlocked exists', () => {
    expect(
      needsSCAApproval({
        ...emptyGroups(),
        unlocked: [makeClassified({ tokenType: 'unlocked' })],
      }),
    ).toBe(true)
  })

  it('returns true when any locked-2ld exists', () => {
    expect(
      needsSCAApproval({
        ...emptyGroups(),
        locked2ld: [makeClassified({ tokenType: 'locked-2ld' })],
      }),
    ).toBe(true)
  })

  it('returns true when any child parent group exists', () => {
    const child = makeClassified({
      tokenType: 'locked-child',
      parentName: 'raffy.eth',
    })
    expect(
      needsSCAApproval({
        ...emptyGroups(),
        childNames: new Map([['raffy.eth', [child]]]),
      }),
    ).toBe(true)
  })
})

describe('buildStepDescriptors', () => {
  it('emits only batch steps when approval is not needed', () => {
    const classified = [makeClassified()]
    const groups = emptyGroups()
    const descriptors = buildStepDescriptors(
      classified,
      groups,
      makePreflight(),
    )

    expect(descriptors).toEqual([
      { type: 'migrate-batch', batch: 1, totalBatches: 1, count: 1 },
    ])
  })

  it('prepends approve-sca when approval is required and not skipped', () => {
    const classified = [makeClassified()]
    const groups = withUnwrapped(1)
    const descriptors = buildStepDescriptors(
      classified,
      groups,
      makePreflight(),
    )

    expect(descriptors[0]).toEqual({ type: 'approve-sca', count: 1 })
  })

  it('skips approve-sca when skipApprovalPhase is true', () => {
    const classified = [makeClassified()]
    const groups = withUnwrapped(1)
    const descriptors = buildStepDescriptors(
      classified,
      groups,
      makePreflight({ skipApprovalPhase: true }),
    )

    expect(descriptors.find((d) => d.type === 'approve-sca')).toBeUndefined()
  })

  it('adds ensure-resolver when any name needs the owned PermRes', () => {
    const classified = [
      makeClassified({ resolverStrategy: 'to-owned-permres' }),
    ]
    const descriptors = buildStepDescriptors(
      classified,
      emptyGroups(),
      makePreflight(),
    )

    expect(descriptors.find((d) => d.type === 'ensure-resolver')).toEqual({
      type: 'ensure-resolver',
    })
  })

  it('omits ensure-resolver when no name needs the owned PermRes', () => {
    const classified = [makeClassified({ resolverStrategy: 'keep-v1' })]
    const descriptors = buildStepDescriptors(
      classified,
      emptyGroups(),
      makePreflight(),
    )

    expect(
      descriptors.find((d) => d.type === 'ensure-resolver'),
    ).toBeUndefined()
  })

  it('omits ensure-resolver when a pre-existing PermRes is supplied', () => {
    const classified = [
      makeClassified({ resolverStrategy: 'to-owned-permres' }),
    ]
    const descriptors = buildStepDescriptors(
      classified,
      emptyGroups(),
      makePreflight({
        preExistingOwnedPermRes:
          '0x0000000000000000000000000000000000000abc' as Address,
      }),
    )

    expect(
      descriptors.find((d) => d.type === 'ensure-resolver'),
    ).toBeUndefined()
  })

  it('emits 2 batches at MAX_NAMES_PER_BATCH + 1 and reports correct counts', () => {
    const classified = Array.from({ length: MAX_NAMES_PER_BATCH + 1 }, (_, i) =>
      makeClassified({ id: `0x${i}` }),
    )
    const descriptors = buildStepDescriptors(
      classified,
      emptyGroups(),
      makePreflight(),
    )

    const batchDescriptors = descriptors.filter(
      (d) => d.type === 'migrate-batch',
    )
    expect(batchDescriptors).toEqual([
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
    const classified = Array.from({ length: MAX_NAMES_PER_BATCH }, (_, i) =>
      makeClassified({ id: `0x${i}` }),
    )
    const descriptors = buildStepDescriptors(
      classified,
      emptyGroups(),
      makePreflight(),
    )

    const batches = descriptors.filter((d) => d.type === 'migrate-batch')
    expect(batches).toHaveLength(1)
    expect(batches[0]).toMatchObject({
      totalBatches: 1,
      count: MAX_NAMES_PER_BATCH,
    })
  })

  it('orders descriptors as approve-sca → ensure-resolver → migrate-batch', () => {
    const classified = [
      makeClassified({ resolverStrategy: 'to-owned-permres' }),
    ]
    const descriptors = buildStepDescriptors(
      classified,
      withUnwrapped(1),
      makePreflight(),
    )

    expect(descriptors.map((d) => d.type)).toEqual([
      'approve-sca',
      'ensure-resolver',
      'migrate-batch',
    ])
  })

  it('returns no descriptors for an empty classified list', () => {
    expect(buildStepDescriptors([], emptyGroups(), makePreflight())).toEqual([])
  })
})
