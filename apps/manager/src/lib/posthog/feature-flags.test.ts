import { describe, expect, it } from 'vitest'
import { isMigrationNftEnabled } from './feature-flags'

describe('isMigrationNftEnabled', () => {
  it('disables NFTs on Sepolia even with both flags enabled', () => {
    expect(
      isMigrationNftEnabled({
        network: 'sepolia',
        migrationEnabled: true,
        migrationNftEnabled: true,
      }),
    ).toBe(false)
  })

  it.each([
    [true, true, true],
    [true, false, false],
    [false, true, false],
    [false, false, false],
    [true, null, false],
    [undefined, true, false],
  ] as const)('returns %s and %s as %s', (migrationEnabled, migrationNftEnabled, expected) => {
    expect(
      isMigrationNftEnabled({
        network: 'mainnet',
        migrationEnabled,
        migrationNftEnabled,
      }),
    ).toBe(expected)
  })
})
