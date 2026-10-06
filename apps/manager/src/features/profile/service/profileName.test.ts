import { describe, expect, it } from 'vitest'
import {
  getCanonicalPrimaryName,
  normalizeEth2LdName,
  normalizeEthName,
  normalizeProfileName,
  requireCanonicalPrimaryName,
} from './profileName'

describe('canonical primary names', () => {
  it.each([
    'alice',
    'alice.eth',
    'sub.alice.eth',
    'café.eth',
    'example.com',
  ])('preserves the identity of %s', (name) => {
    const expected = name === 'alice' ? 'alice.eth' : name
    expect(getCanonicalPrimaryName(name)).toBe(expected)
    expect(requireCanonicalPrimaryName(name)).toBe(expected)
  })

  it.each([
    'ALICE.eth',
    'alice.ETH',
    'ＡＬＩＣＥ.eth',
    'cafe\u0301.eth',
    'alice..eth',
    '',
    '.eth',
  ])('rejects %j instead of substituting another name', (name) => {
    expect(getCanonicalPrimaryName(name)).toBeNull()
    expect(() => requireCanonicalPrimaryName(name)).toThrow(/canonical/)
  })
})

describe('normalizeProfileName', () => {
  it('normalizes valid dotted names', () => {
    expect(normalizeProfileName('Sub.FOO.ETH')).toBe('sub.foo.eth')
    expect(normalizeProfileName('ＡＬＩＣＥ.eth')).toBe('alice.eth')
  })

  it('rejects names that cannot be normalized', () => {
    expect(normalizeProfileName('foo..eth')).toBeNull()
    expect(normalizeProfileName('xn--raffy.eth')).toBeNull()
    expect(normalizeProfileName('foo')).toBeNull()
  })
})

describe('normalizeEthName', () => {
  it('normalizes ENS names before splitting labels', () => {
    expect(normalizeEthName('Sub.FOO.ETH')).toEqual({
      leafLabel: 'sub',
      name: 'sub.foo.eth',
      parentLabelsRootFirst: ['foo'],
    })
  })

  it('rejects invalid ENS names', () => {
    expect(normalizeEthName('xn--raffy.eth')).toBeNull()
    expect(normalizeEthName('foo..eth')).toBeNull()
    expect(normalizeEthName('foo.com')).toBeNull()
  })
})

describe('normalizeEth2LdName', () => {
  it('only accepts normalized 2LD .eth names', () => {
    expect(normalizeEth2LdName('FOO.ETH')).toEqual({
      label: 'foo',
      name: 'foo.eth',
    })
    expect(normalizeEth2LdName('sub.foo.eth')).toBeNull()
  })
})
