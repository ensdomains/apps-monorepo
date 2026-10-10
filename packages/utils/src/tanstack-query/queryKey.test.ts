import { describe, expect, it } from 'vitest'
import { createQueryKey } from './queryKey'

describe('createQueryKey', () => {
  it('builds keys with or without variables and exposes the bare key', () => {
    const userKey = createQueryKey<'user', { readonly id: string }>('user')

    expect(userKey({ id: '1' })).toEqual(['user', { id: '1' }])
    expect(userKey.key).toBe('user')
    expect(createQueryKey('all')()).toEqual(['all'])
  })
})
