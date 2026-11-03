import { describe, expect, it } from 'vitest'
import { getMigrationEstimateProgress } from './migrationEstimateProgress'

describe('migration estimate progress', () => {
  it('counts selected names once within the overall preparation percentage', () => {
    expect(
      getMigrationEstimateProgress({
        stage: 'preparing-upgrade',
        selectedNames: ['alice.eth', 'alice.eth', 'bob.eth'],
        estimatedNames: [
          'alice.eth',
          'alice.eth',
          'child.alice.eth',
          'other.eth',
        ],
      }),
    ).toEqual({ stage: 'preparing-upgrade', percentage: 58 })
  })

  it('carries completed work into the next stage and reserves 100 for readiness', () => {
    const selectedNames = ['alice.eth', 'bob.eth']
    const checked = getMigrationEstimateProgress({
      selectedNames,
      stage: 'checking-names',
      estimatedNames: selectedNames,
    })
    const next = getMigrationEstimateProgress({
      selectedNames,
      stage: 'finding-records',
      estimatedNames: [],
      previous: checked,
    })
    const finished = getMigrationEstimateProgress({
      selectedNames,
      stage: 'checking-fee',
      estimatedNames: selectedNames,
      previous: next,
    })
    expect(checked.percentage).toBe(16)
    expect(next).toEqual({ stage: 'finding-records', percentage: 16 })
    expect(finished).toEqual({ stage: 'checking-fee', percentage: 99 })
  })

  it.each([
    { stage: 'preparing-upgrade', estimatedNames: [] },
    { stage: 'reading-records', estimatedNames: ['alice.eth', 'bob.eth'] },
  ] as const)('ignores regressive work from $stage', (update) => {
    const previous = { stage: 'preparing-upgrade', percentage: 58 } as const
    expect(
      getMigrationEstimateProgress({
        selectedNames: ['alice.eth', 'bob.eth'],
        previous,
        ...update,
      }),
    ).toEqual(previous)
  })

  it('starts an empty selection at zero', () => {
    expect(
      getMigrationEstimateProgress({
        stage: 'checking-names',
        selectedNames: [],
        estimatedNames: [],
      }).percentage,
    ).toBe(0)
  })
})
