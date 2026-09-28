import { describe, expect, it } from 'vitest'
import { makeClassified, OTHER } from '../service/_fixtures'
import {
  ALL_ELIGIBLE_PRESET,
  NO_MANAGER_RESTORATION_PRESET,
  proposeNoManagerRestorationNames,
  proposeRequestedMigrationNames,
  validateMigrationAiSearch,
} from './migrationAiPreset'

describe('proposeNoManagerRestorationNames', () => {
  it('proposes eligible independent names without manager restoration', () => {
    const proposal = proposeNoManagerRestorationNames([
      makeClassified({ name: 'one.eth', parentName: 'eth' }),
      makeClassified({
        name: 'gifted.eth',
        parentName: 'eth',
        managerAddress: OTHER,
      }),
      makeClassified({ name: 'two.eth', parentName: 'eth' }),
    ])

    expect(proposal.selected).toEqual(new Set(['one.eth', 'two.eth']))
    expect(proposal.excluded).toEqual(new Set(['gifted.eth']))
    expect(proposal.dependencyConflicts).toEqual([])
  })

  it('excludes and explains subnames of an excluded parent, including deep descendants', () => {
    const proposal = proposeNoManagerRestorationNames([
      makeClassified({
        name: 'gifted.eth',
        parentName: 'eth',
        managerAddress: OTHER,
      }),
      makeClassified({ name: 'one.gifted.eth', parentName: 'gifted.eth' }),
      makeClassified({
        name: 'two.one.gifted.eth',
        parentName: 'one.gifted.eth',
      }),
      makeClassified({ name: 'independent.eth', parentName: 'eth' }),
    ])

    expect(proposal.selected).toEqual(new Set(['independent.eth']))
    expect(proposal.excluded).toEqual(
      new Set(['gifted.eth', 'one.gifted.eth', 'two.one.gifted.eth']),
    )
    expect(proposal.dependencyConflicts).toEqual([
      { name: 'one.gifted.eth', excludedParent: 'gifted.eth' },
      { name: 'two.one.gifted.eth', excludedParent: 'gifted.eth' },
    ])
  })

  it('can keep a parent while excluding only its restoration-dependent child', () => {
    const proposal = proposeNoManagerRestorationNames([
      makeClassified({ name: 'parent.eth', parentName: 'eth' }),
      makeClassified({
        name: 'child.parent.eth',
        parentName: 'parent.eth',
        managerAddress: OTHER,
      }),
    ])

    expect(proposal.selected).toEqual(new Set(['parent.eth']))
    expect(proposal.excluded).toEqual(new Set(['child.parent.eth']))
    expect(proposal.dependencyConflicts).toEqual([])
  })
})

describe('exact migration name requests', () => {
  const parent = makeClassified({ name: 'parent.eth', parentName: 'eth' })
  const child = makeClassified({
    name: 'child.parent.eth',
    parentName: 'parent.eth',
  })
  const other = makeClassified({ name: 'other.eth', parentName: 'eth' })

  it('normalizes and deduplicates exact names without adding names', () => {
    expect(
      validateMigrationAiSearch({
        names: ['PARENT.eth', 'parent.eth'],
        preset: NO_MANAGER_RESTORATION_PRESET,
      }),
    ).toEqual({ names: ['parent.eth'], preset: NO_MANAGER_RESTORATION_PRESET })
    expect(validateMigrationAiSearch({})).toEqual({})
    expect(validateMigrationAiSearch({ preset: ALL_ELIGIBLE_PRESET })).toEqual({
      preset: ALL_ELIGIBLE_PRESET,
    })
  })

  it.each([
    [],
    ['bad name.eth'],
    ['good.eth', 3],
    'parent.eth',
    Array.from({ length: 101 }, (_, i) => `name${i}.eth`),
  ])('rejects invalid input instead of widening selection: %#', (names) => {
    expect(() => validateMigrationAiSearch({ names })).toThrow()
  })

  it('selects only requested eligible names, preserving an unrequested child', () => {
    const result = proposeRequestedMigrationNames(
      [parent, child, other],
      ['parent.eth'],
    )
    expect(result.selected).toEqual(new Set(['parent.eth']))
    expect(result.dependencyConflicts).toEqual([])
  })

  it('reports an excluded required parent instead of silently selecting it', () => {
    const result = proposeRequestedMigrationNames(
      [parent, child, other],
      ['child.parent.eth', 'other.eth'],
    )
    expect(result.selected).toEqual(new Set(['other.eth']))
    expect(result.dependencyConflicts).toEqual([
      { name: 'child.parent.eth', excludedParent: 'parent.eth' },
    ])
  })

  it('accepts a requested parent and child together and reports unavailable names', () => {
    const result = proposeRequestedMigrationNames(
      [parent, child],
      ['PARENT.eth', 'child.parent.eth', 'missing.eth'],
    )
    expect(result.selected).toEqual(new Set(['parent.eth', 'child.parent.eth']))
    expect(result.unavailable).toEqual(['missing.eth'])
  })

  it('combines exact names with the manager-restoration exclusion, including deep dependencies', () => {
    const restoration = { ...parent, managerAddress: OTHER }
    const grandchild = makeClassified({
      name: 'deep.child.parent.eth',
      parentName: 'child.parent.eth',
    })
    const result = proposeRequestedMigrationNames(
      [restoration, child, grandchild, other],
      ['parent.eth', 'child.parent.eth', 'deep.child.parent.eth', 'other.eth'],
      NO_MANAGER_RESTORATION_PRESET,
    )
    expect(result.selected).toEqual(new Set(['other.eth']))
    expect(result.excluded).toEqual(
      new Set(['parent.eth', 'child.parent.eth', 'deep.child.parent.eth']),
    )
    expect(result.dependencyConflicts).toContainEqual({
      name: 'child.parent.eth',
      excludedParent: 'parent.eth',
    })
  })

  it('requires an explicitly requested manager name but does not exclude it without that constraint', () => {
    expect(
      proposeRequestedMigrationNames(
        [{ ...parent, managerAddress: OTHER }, other],
        ['parent.eth'],
      ).selected,
    ).toEqual(new Set(['parent.eth']))
  })

  it('keeps an exact subset narrower than the all-eligible preset', () => {
    const result = proposeRequestedMigrationNames(
      [{ ...parent, managerAddress: OTHER }, child, other],
      ['parent.eth', 'child.parent.eth'],
      ALL_ELIGIBLE_PRESET,
    )
    expect(result.selected).toEqual(new Set(['parent.eth', 'child.parent.eth']))
    expect(result.unavailable).toEqual([])
    expect(result.dependencyConflicts).toEqual([])
  })
})
