import type {
  QueryFunction,
  QueryFunctionContext,
  QueryKey,
} from '@tanstack/react-query'
import { ok } from 'neverthrow'
import { describe, expect, it } from 'vitest'
import { createQueryKey } from '../queryKey'
import { resultQueryOptions } from './query'

const scratchKey = createQueryKey<'scratch', { readonly id: string }>('scratch')

/** Runs the adapted `queryFn` the way TanStack would, minus the cache around it. */
const runQueryFn = (queryFn: unknown): unknown => {
  if (typeof queryFn !== 'function') throw new Error('queryFn was not adapted')

  const run = queryFn as QueryFunction<unknown, QueryKey>
  return run({} as unknown as QueryFunctionContext<QueryKey>)
}

describe('resultQueryOptions', () => {
  // These were being destructured away, so every caller silently ran on the
  // app's default staleTime of 0: a refetch on each mount and window focus.
  it('passes caching options through', () => {
    const options = resultQueryOptions({
      queryKey: scratchKey({ id: 'caching' }),
      queryFn: () => ok(1),
      staleTime: 60_000,
      gcTime: 120_000,
    })

    expect(options.staleTime).toBe(60_000)
    expect(options.gcTime).toBe(120_000)
  })

  it('unwraps a result into the value tanstack caches', () => {
    const options = resultQueryOptions({
      queryKey: scratchKey({ id: 'unwrap' }),
      queryFn: () => ok(1),
    })

    expect(runQueryFn(options.queryFn)).toBe(1)
  })
})
