import { ok } from 'neverthrow'
import { describe, expect, it } from 'vitest'
import { resultQueryOptions } from './query'

describe('resultQueryOptions', () => {
  it('preserves explicit cache timings', () => {
    const options = resultQueryOptions({
      queryKey: ['cache-timings'],
      queryFn: () => ok('value'),
      staleTime: 5 * 60_000,
      gcTime: 10 * 60_000,
    })

    expect(options.staleTime).toBe(5 * 60_000)
    expect(options.gcTime).toBe(10 * 60_000)
  })

  it('leaves cache timings unset when they were not provided', () => {
    const options = resultQueryOptions({
      queryKey: ['default-cache-timings'],
      queryFn: () => ok('value'),
    })

    expect(options).not.toHaveProperty('staleTime')
    expect(options).not.toHaveProperty('gcTime')
  })
})
