import { describe, expect, it } from 'vitest'
import { makeClassified, OTHER } from '../service/_fixtures'
import { proposeNoManagerRestorationNames } from './migrationAiPreset'

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
