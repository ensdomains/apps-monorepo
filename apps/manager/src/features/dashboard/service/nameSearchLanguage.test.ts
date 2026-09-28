import { describe, expect, it } from 'vitest'
import { normalizeNegativeNameSelection } from './nameSearchLanguage'

describe('explicit shared negation of name properties', () => {
  it.each([
    ['neither favorites nor primary', 'not favorites and not primary'],
    ['neither favorites nor primary.', 'not favorites and not primary.'],
    ['neither my primary name nor favourites', 'not primary and not favorites'],
    ['not either starred names or main names', 'not favorites and not primary'],
    ["aren't either primary or bookmarked", 'not primary and not favorites'],
    ['aren’t either favourites or primary', 'not favorites and not primary'],
    [
      'without either favourites or reverse names',
      'not favorites and not primary',
    ],
    [
      'excluding both favourites and primary names',
      'not favorites and not primary',
    ],
    [
      'exclude both primary names and starred names',
      'not primary and not favorites',
    ],
  ])('preserves the two negative conditions in %s', (phrase, expected) => {
    expect(normalizeNegativeNameSelection(`Show V2 names ${phrase}`)).toBe(
      `Show V2 names ${expected}`,
    )
  })

  it('preserves the selection, duration, ordering and exact names around the pair', () => {
    expect(
      normalizeNegativeNameSelection(
        'Renew primary.eth and favorites.eth that are neither favourites nor primary for 84 days, latest expiry first',
      ),
    ).toBe(
      'Renew primary.eth and favorites.eth that are not favorites and not primary for 84 days, latest expiry first',
    )
  })

  it.each([
    'Show not favorites or primary names',
    'Show favorites or primary names',
    'Show neither owner nor manager names',
    'Show neither V1 nor V2 names',
    'Show neither favorites nor favorites',
    'Show names not neither favorites nor primary',
    'Show names not excluding both favorites and primary',
    'Show names without neither favorites nor primary',
    'Show neither favorites nor primaryeligible names',
    'Show neither favorites nor primary-name.eth',
    'Show neither favorites.eth nor primary.eth',
    'Show neither favorites nor primary.eth',
    'Show neither favorites nor primary@example.com',
    'Show neither favorites nor https://primary.example',
    'Set description to "neither favourites nor primary"',
    "Set description to 'neither favourites nor primary'",
    'Set description to “neither favourites nor primary”',
    'Set description to ‘neither favourites nor primary’',
  ])('leaves ambiguous, unrelated or exact content unchanged: %s', (query) => {
    expect(normalizeNegativeNameSelection(query)).toBe(query)
  })

  it('does not discard a later unsupported alternative or requirement', () => {
    expect(
      normalizeNegativeNameSelection(
        'Show neither favourites nor primary or names about animals',
      ),
    ).toBe('Show not favorites and not primary or names about animals')
    expect(
      normalizeNegativeNameSelection(
        'Show neither favorites nor primary nor expired',
      ),
    ).toBe('Show not favorites and not primary nor expired')
  })

  it('is stable after normalization', () => {
    const query = 'Show names that are neither favorites nor primary'
    const normalized = normalizeNegativeNameSelection(query)
    expect(normalizeNegativeNameSelection(normalized)).toBe(normalized)
  })
})
