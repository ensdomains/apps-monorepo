import { describe, expect, it } from 'vitest'
import { getNameReach } from './getNameReach'

const RESOLVER = '0x3333333333333333333333333333333333333333'

describe('getNameReach', () => {
  it.each([
    ['pending', undefined, 'checking'],
    ['error', undefined, 'unknown'],
    // Only the ENSv1 registry names it, so lookups don't read it (WEB-2017).
    ['success', { address: RESOLVER, source: 'v1-registry' }, 'unreachable'],
    ['success', { address: RESOLVER, source: 'lookup' }, 'reachable'],
    // No resolver at all: nothing to block here, the write itself has no target.
    ['success', null, 'reachable'],
  ] as const)('reads %s %o as %s', (status, data, reach) => {
    expect(getNameReach({ status, data })).toBe(reach)
  })
})
