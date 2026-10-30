import { describe, expect, it } from 'vitest'
import { getResolverReplacement } from './resolverReplacement'

describe('getResolverReplacement', () => {
  it.each([
    { isResolverInvalid: false, hasResolver: false, expected: 'nothing' },
    { isResolverInvalid: false, hasResolver: true, expected: 'resolver' },
    // An invalid pointer can read as no resolver, so the flag wins either way.
    {
      isResolverInvalid: true,
      hasResolver: false,
      expected: 'invalid-resolver',
    },
    {
      isResolverInvalid: true,
      hasResolver: true,
      expected: 'invalid-resolver',
    },
  ] as const)(
    'is $expected when invalid=$isResolverInvalid and hasResolver=$hasResolver',
    ({ expected, ...input }) => {
      expect(getResolverReplacement(input)).toBe(expected)
    },
  )
})
