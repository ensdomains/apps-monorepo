import { describe, expect, it } from 'vitest'
import { formatNamesPreview } from './migrationPlan.helpers'

describe('formatNamesPreview', () => {
  it.each([
    [['a.eth'], 'a.eth'],
    [['a.eth', 'b.eth'], 'a.eth, b.eth'],
    [['a.eth', 'b.eth', 'c.eth'], 'a.eth, b.eth, c.eth'],
    [['a.eth', 'b.eth', 'c.eth', 'd.eth'], 'a.eth, b.eth, c.eth (+1 more)'],
    [
      ['a.eth', 'b.eth', 'c.eth', 'd.eth', 'e.eth'],
      'a.eth, b.eth, c.eth (+2 more)',
    ],
  ])('formats %j', (names, expected) => {
    expect(formatNamesPreview(names)).toBe(expected)
  })

  it('respects custom limit', () => {
    expect(formatNamesPreview(['a', 'b', 'c'], 1)).toBe('a (+2 more)')
  })
})
