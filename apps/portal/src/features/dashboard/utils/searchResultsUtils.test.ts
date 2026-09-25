import { describe, expect, it, vi } from 'vitest'
import type { Suggestion } from './buildSearchSuggestions'
import {
  buildSearchResultItems,
  sortExactMatchFirst,
} from './searchResultsUtils'

const noop = vi.fn()

function suggestion(
  overrides: Partial<Suggestion> & { id: string; inputValue: string },
): Suggestion {
  return {
    ...overrides,
    label: overrides.label ?? overrides.inputValue,
    description: overrides.description ?? '',
    action: overrides.action ?? noop,
  }
}

describe('buildSearchResultItems', () => {
  it('returns empty array when all inputs are empty', () => {
    expect(
      buildSearchResultItems({
        suggestions: [],
        ownedNamesFiltered: [],
      }),
    ).toEqual([])
  })

  it('puts suggestions first in order', () => {
    const suggestions: Suggestion[] = [
      suggestion({ id: 'name:foo.eth', inputValue: 'foo.eth' }),
      suggestion({ id: 'name:bar.eth', inputValue: 'bar.eth' }),
    ]
    const result = buildSearchResultItems({
      suggestions,
      ownedNamesFiltered: [],
    })
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      type: 'suggestion',
      value: 'name:foo.eth',
      suggestion: suggestions[0],
    })
    expect(result[1]).toEqual({
      type: 'suggestion',
      value: 'name:bar.eth',
      suggestion: suggestions[1],
    })
  })

  it('puts owned names after suggestions', () => {
    const result = buildSearchResultItems({
      suggestions: [],
      ownedNamesFiltered: [{ name: 'fox.eth' }, { name: 'bar.eth' }],
    })
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      type: 'owned',
      value: 'owned:fox.eth',
      name: 'fox.eth',
    })
    expect(result[1]).toEqual({
      type: 'owned',
      value: 'owned:bar.eth',
      name: 'bar.eth',
    })
  })

  it('returns items in order: suggestions, then owned', () => {
    const suggestions: Suggestion[] = [
      suggestion({ id: 'name:x.eth', inputValue: 'x.eth' }),
    ]
    const ownedNamesFiltered = [{ name: 'owned.eth' }]
    const result = buildSearchResultItems({
      suggestions,
      ownedNamesFiltered,
    })
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ type: 'suggestion', value: 'name:x.eth' })
    expect(result[1]).toMatchObject({
      type: 'owned',
      value: 'owned:owned.eth',
      name: 'owned.eth',
    })
  })

  it('uses suggestion id as value for suggestion items', () => {
    const suggestions: Suggestion[] = [
      suggestion({ id: 'name:vitalik.eth', inputValue: 'vitalik.eth' }),
    ]
    const result = buildSearchResultItems({
      suggestions,
      ownedNamesFiltered: [],
    })
    expect(result[0]).toMatchObject({
      type: 'suggestion',
      value: 'name:vitalik.eth',
    })
  })

  it('prefixes owned values with "owned:"', () => {
    const result = buildSearchResultItems({
      suggestions: [],
      ownedNamesFiltered: [{ name: 'my.eth' }],
    })
    expect(result[0].type === 'owned' && result[0].value).toBe('owned:my.eth')
  })
})

describe('sortExactMatchFirst', () => {
  const suggestions = [
    suggestion({ id: 'name:fox.eth', inputValue: 'fox.eth' }),
    suggestion({ id: 'name:fox.box', inputValue: 'fox.box' }),
    suggestion({ id: 'name:fox.com', inputValue: 'fox.com' }),
  ]

  it('moves the exact match to the front, keeping the rest in order', () => {
    expect(
      sortExactMatchFirst(suggestions, 'fox.com').map((s) => s.inputValue),
    ).toEqual(['fox.com', 'fox.eth', 'fox.box'])
  })

  it('returns the list unchanged when the exact match is already first', () => {
    expect(sortExactMatchFirst(suggestions, 'fox.eth')).toBe(suggestions)
  })

  it('returns the list unchanged when there is no exact match', () => {
    expect(sortExactMatchFirst(suggestions, 'other.eth')).toBe(suggestions)
    expect(sortExactMatchFirst(suggestions, '')).toBe(suggestions)
  })
})
