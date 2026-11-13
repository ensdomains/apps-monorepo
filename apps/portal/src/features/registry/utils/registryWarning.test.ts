import { describe, expect, it } from 'vitest'
import { selectRegistryWarning, toRegistryCheck } from './registryWarning'

describe('selectRegistryWarning', () => {
  it.each([
    ['an untrusted registry', true, true, 'untrusted'],
    [
      'an untrusted registry while the affected check loads',
      true,
      'pending',
      'untrusted',
    ],
    [
      'an untrusted registry whose affected check failed',
      true,
      'failed',
      'untrusted',
    ],
    ['an affected registry', false, true, 'affected'],
    [
      'an affected registry whose untrusted check failed',
      'failed',
      true,
      'affected',
    ],
    [
      'an affected registry while the untrusted check loads',
      'pending',
      true,
      null,
    ],
    ['an unaffected registry', false, false, null],
    ['a registry whose affected check is loading', false, 'pending', null],
    ['a registry whose affected check failed', false, 'failed', null],
    ['a registry whose checks both failed', 'failed', 'failed', null],
  ] as const)('%s', (_, untrusted, affected, expected) => {
    expect(selectRegistryWarning({ untrusted, affected })).toBe(expected)
  })
})

describe('toRegistryCheck', () => {
  it.each([
    ['an answer', { data: true, isError: false }, true],
    [
      'cached data after a failed refetch',
      { data: false, isError: true },
      false,
    ],
    ['a failed read', { data: undefined, isError: true }, 'failed'],
    ['a read in flight', { data: undefined, isError: false }, 'pending'],
  ] as const)('reads %s', (_, query, expected) => {
    expect(toRegistryCheck(query)).toBe(expected)
  })
})
