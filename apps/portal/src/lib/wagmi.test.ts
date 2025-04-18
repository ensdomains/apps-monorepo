import { describe, expect, it } from 'vitest'
import { queryClient } from './wagmi'

describe('queryClient', () => {
  it('default stale time should be 1 hour', () => {
    expect(queryClient.getDefaultOptions().queries?.gcTime).toBe(
      1000 * 60 * 60 * 1,
    )
  })
})
