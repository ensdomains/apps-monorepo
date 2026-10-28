import { describe, expect, it } from 'vitest'
import { isMigrationNftEnabled } from './feature-flags'

describe('isMigrationNftEnabled', () => {
  it.each([
    ['mainnet', true, true],
    ['mainnet', false, true],
    ['mainnet', undefined, true],
    ['sepolia', true, true],
    ['sepolia', false, false],
    ['sepolia', null, false],
    ['sepolia', undefined, false],
  ] as const)(
    'on %s with the flag %s returns %s',
    (network, migrationNftEnabled, expected) => {
      expect(isMigrationNftEnabled({ network, migrationNftEnabled })).toBe(
        expected,
      )
    },
  )
})
