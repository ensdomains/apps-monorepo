import { ok } from 'neverthrow'
import { afterEach, expect, it, vi } from 'vitest'
import { getNameStats, getNameStatsDemand } from './nameStats.query'

afterEach(() => vi.unstubAllGlobals())

it.each([
  { searches: null, visibleSearches: undefined },
  { searches: 0, visibleSearches: 0 },
])(
  'keeps favorites while distinguishing unavailable search demand from $searches',
  async ({ searches, visibleSearches }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          name: 'alice.eth',
          favorites: 12,
          unique_searches_last_30d: searches,
        }),
      ),
    )
    const result = await getNameStats('alice.eth')
    expect(result.map(getNameStatsDemand)).toEqual(
      ok({ favoriteCount: 12, searchCount30d: visibleSearches }),
    )
  },
)
