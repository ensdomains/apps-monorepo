import { describe, expect, it } from 'vitest'
import { selectRegistryWarning } from './registryWarning'

describe('selectRegistryWarning', () => {
  it.each([
    ['an untrusted registry', true, true, 'untrusted'],
    [
      'an untrusted registry while the affected check loads',
      true,
      undefined,
      'untrusted',
    ],
    ['an affected registry', false, true, 'affected'],
    ['an unaffected registry', false, false, null],
    [
      'an affected registry while the untrusted check loads',
      undefined,
      true,
      null,
    ],
    [
      'a registry whose affected check is loading or failed',
      false,
      undefined,
      null,
    ],
    [
      'a registry whose checks are loading or failed',
      undefined,
      undefined,
      null,
    ],
  ] as const)('%s', (_, isUntrusted, isPendingUpgrade, expected) => {
    expect(selectRegistryWarning({ isUntrusted, isPendingUpgrade })).toBe(
      expected,
    )
  })
})
