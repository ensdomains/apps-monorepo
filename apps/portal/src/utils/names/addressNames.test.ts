import type { NameSummary } from '@ens-apps/indexer/reads'
import { describe, expect, it } from 'vitest'
import {
  byShownExpiry,
  isShownExpiryInRange,
  toAddressNameItem,
} from './addressNames'

describe('isShownExpiryInRange', () => {
  const range = {
    from: new Date(Date.UTC(2030, 0, 1)),
    to: new Date(Date.UTC(2030, 11, 31)),
  }

  it("matches a subname by its parent's expiry", () => {
    expect(
      isShownExpiryInRange(
        { expiryDate: null, parentExpiryDate: new Date(Date.UTC(2030, 5, 1)) },
        range,
      ),
    ).toBe(true)
  })

  it("prefers the name's own expiry and drops a row with none", () => {
    expect(
      isShownExpiryInRange(
        {
          expiryDate: new Date(Date.UTC(2031, 0, 1)),
          parentExpiryDate: new Date(Date.UTC(2030, 5, 1)),
        },
        range,
      ),
    ).toBe(false)
    expect(isShownExpiryInRange({ expiryDate: null }, range)).toBe(false)
  })
})

describe('byShownExpiry', () => {
  it("sorts by the shown expiry, the parent's for a subname, with none last", () => {
    const rows = [
      { name: 'never', expiryDate: null },
      { name: 'later', expiryDate: new Date(Date.UTC(2031, 0, 1)) },
      {
        name: 'subname',
        expiryDate: null,
        parentExpiryDate: new Date(Date.UTC(2030, 0, 1)),
      },
    ]

    expect(rows.toSorted(byShownExpiry).map(({ name }) => name)).toEqual([
      'subname',
      'later',
      'never',
    ])
  })
})

describe('toAddressNameItem', () => {
  const summary = (isWrapped: boolean): NameSummary => ({
    name: 'alice.eth',
    displayName: 'alice.eth',
    namehash: '0xabc',
    protocol: 'v1',
    relations: ['owner', 'manager'],
    isPrimary: false,
    isMigrated: false,
    isWrapped,
    registrationStatus: 'active',
    expiresAt: null,
    servedExpiry: null,
    graceEndsAt: null,
    registeredAt: null,
    createdAt: null,
  })

  it.each([
    ['only the owner role on a wrapped name', true, ['owner']],
    ['both roles on an unwrapped name', false, ['owner', 'manager']],
  ])('lists %s', (_, isWrapped, relations) => {
    expect(toAddressNameItem(summary(isWrapped))?.relations).toEqual(relations)
  })
})
