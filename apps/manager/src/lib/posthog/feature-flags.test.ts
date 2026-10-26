import { describe, expect, it } from 'vitest'
import { isMigrationNftEnabled } from './feature-flags'

describe('isMigrationNftEnabled', () => {
  it('disables NFTs on Sepolia even with the NFT flag enabled', () => {
    expect(
      isMigrationNftEnabled({
        network: 'sepolia',
        migrationNftEnabled: true,
      }),
    ).toBe(false)
  })

  it.each([
    [true, true],
    [false, false],
    [null, false],
    [undefined, false],
  ] as const)(
    'returns %s as %s on mainnet',
    (migrationNftEnabled, expected) => {
      expect(
        isMigrationNftEnabled({
          network: 'mainnet',
          migrationNftEnabled,
        }),
      ).toBe(expected)
    },
  )
})
