import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { isMigratableBy } from './useMigrationStatus'

const HOLDER: Address = '0x7A824BEa2Bed9399a68cD0e340224809521c81D9'
// The subgraph returns addresses lowercased, wagmi returns them checksummed,
// so the two sides of this comparison genuinely differ in case.
const HOLDER_LOWERCASE: Address = '0x7a824bea2bed9399a68cd0e340224809521c81d9'
const SOMEONE_ELSE: Address = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

describe('isMigratableBy', () => {
  it('is true for the wallet holding the v1 token', () => {
    expect(
      isMigratableBy({ migratable: true, tokenHolder: HOLDER }, HOLDER),
    ).toBe(true)
  })

  it('matches a lowercased subgraph holder against a checksummed wallet', () => {
    expect(
      isMigratableBy(
        { migratable: true, tokenHolder: HOLDER_LOWERCASE },
        HOLDER,
      ),
    ).toBe(true)
  })

  it('is false for a visitor who does not hold the name', () => {
    expect(
      isMigratableBy({ migratable: true, tokenHolder: HOLDER }, SOMEONE_ELSE),
    ).toBe(false)
  })

  it('is false when no wallet is connected', () => {
    expect(
      isMigratableBy({ migratable: true, tokenHolder: HOLDER }, undefined),
    ).toBe(false)
  })

  it('is false when the name itself cannot be migrated', () => {
    expect(isMigratableBy({ migratable: false }, HOLDER)).toBe(false)
  })

  it('is false while the status is still unknown', () => {
    expect(isMigratableBy(undefined, HOLDER)).toBe(false)
  })
})
