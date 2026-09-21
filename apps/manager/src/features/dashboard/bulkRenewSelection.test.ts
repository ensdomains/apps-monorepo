import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type SelectableDomain, toBulkRenewName } from './bulkRenewSelection'

const NOW = new Date('2024-06-01T12:00:00Z')
// Comfortably in the future, so eligibility turns only on the label.
const EXPIRY_SECONDS = BigInt(
  Math.floor(new Date('2025-06-01T12:00:00Z').getTime() / 1000),
)

const domain = (overrides: Partial<SelectableDomain>): SelectableDomain => ({
  id: '0xdomain',
  name: 'alice.eth',
  normalizedName: 'alice.eth',
  expiryDate: EXPIRY_SECONDS,
  ...overrides,
})

describe('toBulkRenewName', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renews the label it displays', () => {
    expect(toBulkRenewName(domain({}))).toEqual({
      displayName: 'alice.eth',
      label: 'alice',
      name: 'alice.eth',
      currentExpiry: EXPIRY_SECONDS,
    })
  })

  // A look-alike must never be renewed as its twin, which can be someone else's.
  it('excludes a mixed-case look-alike', () => {
    const raw = domain({ name: 'ALICE.eth', normalizedName: 'alice.eth' })
    expect(toBulkRenewName(raw)).toBeNull()
  })

  it('excludes a soft-hyphen look-alike', () => {
    const raw = domain({
      // U+00AD SOFT HYPHEN — invisible, and stripped by normalization.
      name: 'ali\u00ADce.eth',
      normalizedName: 'alice.eth',
    })
    expect(toBulkRenewName(raw)).toBeNull()
  })

  it('never falls back to the token id as a label', () => {
    expect(
      toBulkRenewName(domain({ name: null, normalizedName: null })),
    ).toBeNull()
  })

  it('excludes subnames and non-.eth names', () => {
    expect(
      toBulkRenewName(
        domain({ name: 'sub.alice.eth', normalizedName: 'sub.alice.eth' }),
      ),
    ).toBeNull()
    expect(
      toBulkRenewName(
        domain({ name: 'alice.com', normalizedName: 'alice.com' }),
      ),
    ).toBeNull()
  })

  it('excludes a name past its grace period', () => {
    const expired = BigInt(
      Math.floor(new Date('2023-01-01T00:00:00Z').getTime() / 1000),
    )
    expect(toBulkRenewName(domain({ expiryDate: expired }))).toBeNull()
  })
})
