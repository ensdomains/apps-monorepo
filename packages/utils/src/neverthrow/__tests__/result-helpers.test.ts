import { err } from 'neverthrow'
import { assert, describe, expect, it } from 'vitest'
import { getFirstOrFallback } from '../result-helpers'

describe('getFirstOrFallback', () => {
  it('should return first item from non-empty array', () => {
    const fallback = err('No items found')
    const getFirst = getFirstOrFallback(fallback)

    const result = getFirst([{ id: 1 }, { id: 2 }])
    assert(result.isOk())
    expect(result.value).toEqual({ id: 1 })
  })

  it('should return fallback for empty array', () => {
    const fallback = err('No items found')
    const getFirst = getFirstOrFallback(fallback)

    const result = getFirst([])
    assert(result.isErr())
    expect(result.error).toBe('No items found')
  })

  it('should use fallback function', () => {
    const getFirst = getFirstOrFallback((items) =>
      err(`Expected items but got ${items.length}`),
    )

    const result = getFirst([])
    assert(result.isErr())
    expect(result.error).toBe('Expected items but got 0')
  })

  it('should work with different data types', () => {
    const fallback = err('No strings found')
    const getFirst = getFirstOrFallback(fallback)

    const result = getFirst(['first', 'second', 'third'])
    assert(result.isOk())
    expect(result.value).toBe('first')
  })
})
