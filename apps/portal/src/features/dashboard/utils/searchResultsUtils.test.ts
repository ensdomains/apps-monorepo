import { describe, expect, it, vi } from 'vitest'
import type { Suggestion } from './buildSearchSuggestions'
import { buildSearchResultItems } from './searchResultsUtils'

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
        availableNames: [],
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
      availableNames: [],
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

  it('puts available names after suggestions', () => {
    const suggestions: Suggestion[] = [
      suggestion({ id: 'name:a.eth', inputValue: 'a.eth' }),
    ]
    const availableNames = [{ inputValue: 'new.eth' }]
    const result = buildSearchResultItems({
      suggestions,
      availableNames,
      ownedNamesFiltered: [],
    })
    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('suggestion')
    expect(result[1]).toEqual({
      type: 'available',
      value: 'available:new.eth',
      name: 'new.eth',
    })
  })

  it('puts owned names last', () => {
    const result = buildSearchResultItems({
      suggestions: [],
      availableNames: [],
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

  it('returns items in order: suggestions, then available, then owned', () => {
    const suggestions: Suggestion[] = [
      suggestion({ id: 'name:x.eth', inputValue: 'x.eth' }),
    ]
    const availableNames = [{ inputValue: 'available.eth' }]
    const ownedNamesFiltered = [{ name: 'owned.eth' }]
    const result = buildSearchResultItems({
      suggestions,
      availableNames,
      ownedNamesFiltered,
    })
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ type: 'suggestion', value: 'name:x.eth' })
    expect(result[1]).toMatchObject({
      type: 'available',
      value: 'available:available.eth',
      name: 'available.eth',
    })
    expect(result[2]).toMatchObject({
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
      availableNames: [],
      ownedNamesFiltered: [],
    })
    expect(result[0]).toMatchObject({
      type: 'suggestion',
      value: 'name:vitalik.eth',
    })
  })

  it('prefixes available and owned values with "available:" and "owned:"', () => {
    const result = buildSearchResultItems({
      suggestions: [],
      availableNames: [{ inputValue: 'test.eth' }],
      ownedNamesFiltered: [{ name: 'my.eth' }],
    })
    expect(result[0].type === 'available' && result[0].value).toBe(
      'available:test.eth',
    )
    expect(result[1].type === 'owned' && result[1].value).toBe('owned:my.eth')
  })
})
