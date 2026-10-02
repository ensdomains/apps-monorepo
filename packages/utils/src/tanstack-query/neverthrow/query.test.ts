import { ok } from 'neverthrow'
import { describe, expect, it } from 'vitest'
import { resultQueryOptions } from './query'

describe('resultQueryOptions', () => {
  // These were being destructured away, so every caller silently ran on the
  // app's default staleTime of 0: a refetch on each mount and window focus.
  it('passes caching options through', () => {
    const options = resultQueryOptions({
      queryKey: ['scratch'],
      queryFn: () => ok(1),
      staleTime: 60_000,
      gcTime: 120_000,
    })

    expect(options.staleTime).toBe(60_000)
    expect(options.gcTime).toBe(120_000)
  })

  it('unwraps a result into the value tanstack caches', () => {
    const options = resultQueryOptions({
      queryKey: ['scratch'],
      queryFn: () => ok(1),
    })

    // biome-ignore lint/suspicious/noExplicitAny: exercising the queryFn directly
    expect((options.queryFn as any)({})).toBe(1)
  })
})
