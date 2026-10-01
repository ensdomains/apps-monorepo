import { describe, expect, it } from 'vitest'
import type { ProtocolVersion } from '@/utils/types'
import {
  GRACE_PERIOD_DAYS,
  getSelectedNames,
  isExtendable2LD,
  isNonCanonicalEthName,
  MS_PER_DAY,
  V2_GRACE_PERIOD_DAYS,
} from './nameExtension'

const future = new Date(Date.now() + 30 * MS_PER_DAY)
const withinGrace = new Date(Date.now() - 10 * MS_PER_DAY)
const beyondV1Grace = new Date(
  Date.now() - (GRACE_PERIOD_DAYS + 1) * MS_PER_DAY,
)
const beyondV2Grace = new Date(
  Date.now() - (V2_GRACE_PERIOD_DAYS + 1) * MS_PER_DAY,
)

describe('isNonCanonicalEthName', () => {
  it('is false for a canonical .eth 2LD', () => {
    expect(isNonCanonicalEthName('alice.eth')).toBe(false)
  })

  it('is true when the stored label differs from its normalised form', () => {
    expect(isNonCanonicalEthName('ALICE.eth')).toBe(true)
    // fullwidth letters normalise to ascii
    expect(isNonCanonicalEthName('ｆｏｏ.eth')).toBe(true)
    // zero-width space is stripped by normalisation
    expect(isNonCanonicalEthName('foo\u200bbar.eth')).toBe(true)
    // decomposed e + U+0301 renders like the precomposed é twin
    expect(isNonCanonicalEthName('e\u0301bf.eth')).toBe(true)
  })

  it('is true for an encoded-labelhash 2LD (label unknown, cannot be renewed by label)', () => {
    expect(isNonCanonicalEthName(`[${'a'.repeat(64)}].eth`)).toBe(true)
  })

  it('only judges .eth 2LDs — other shapes are rejected elsewhere', () => {
    expect(isNonCanonicalEthName('SUB.alice.eth')).toBe(false)
    expect(isNonCanonicalEthName('ALICE.com')).toBe(false)
  })
})

describe('isExtendable2LD', () => {
  // Every renew step derives the label with `getLabel`, which normalises, so an
  // Extend offered on a non-canonical spelling would push the *canonical*
  // twin's expiry — a different, separately registrable name. Both entry points
  // into the flow (the name page's Extend button via useCanExtend, and the
  // names table's multi-select) run through this pre-filter.
  describe('non-canonical rejection', () => {
    it.each([
      ['an uppercase label', 'ALICE.eth'],
      ['a fullwidth homoglyph label', 'ａlice.eth'],
      ['an uppercase TLD', 'alice.ETH'],
      ['an encoded labelhash label', `[${'a'.repeat(64)}].eth`],
    ])('rejects %s', (_case, name) => {
      expect(isExtendable2LD({ name, isV2: true, expiryDate: future })).toBe(
        false,
      )
      expect(isExtendable2LD({ name, isV2: false, expiryDate: future })).toBe(
        false,
      )
    })

    it('still accepts the canonical spelling', () => {
      expect(
        isExtendable2LD({ name: 'alice.eth', isV2: true, expiryDate: future }),
      ).toBe(true)
    })
  })

  describe('non-canonical label rejection (Immunefi #90094)', () => {
    it('rejects a 2LD whose stored label is not its normalised form', () => {
      for (const name of ['ALICE.eth', 'ｆｏｏ.eth', 'foo\u200bbar.eth']) {
        expect(
          isExtendable2LD({ name, isV2: true, expiryDate: future }),
          name,
        ).toBe(false)
        expect(
          isExtendable2LD({ name, isV2: false, expiryDate: future }),
          name,
        ).toBe(false)
      }
    })
  })

  describe('subname rejection', () => {
    it('rejects a subname', () => {
      expect(
        isExtendable2LD({
          name: 'sub.alice.eth',
          isV2: true,
          expiryDate: future,
        }),
      ).toBe(false)
    })

    it('rejects a deeply nested subname', () => {
      expect(
        isExtendable2LD({
          name: 'a.b.alice.eth',
          isV2: true,
          expiryDate: future,
        }),
      ).toBe(false)
    })

    it('rejects a non-.eth name', () => {
      expect(
        isExtendable2LD({ name: 'alice.com', isV2: true, expiryDate: future }),
      ).toBe(false)
    })
  })

  describe('v2 names (28-day grace period)', () => {
    it('accepts a v2 name with future expiry', () => {
      expect(
        isExtendable2LD({ name: 'alice.eth', isV2: true, expiryDate: future }),
      ).toBe(true)
    })

    it('accepts a v2 name within the grace period', () => {
      expect(
        isExtendable2LD({
          name: 'alice.eth',
          isV2: true,
          expiryDate: withinGrace,
        }),
      ).toBe(true)
    })

    it('rejects a v2 name beyond the grace period', () => {
      expect(
        isExtendable2LD({
          name: 'alice.eth',
          isV2: true,
          expiryDate: beyondV2Grace,
        }),
      ).toBe(false)
    })

    it('rejects a v2 name with no expiry (indexer loading/error)', () => {
      expect(
        isExtendable2LD({ name: 'alice.eth', isV2: true, expiryDate: null }),
      ).toBe(false)
    })
  })

  describe('v1 names (90-day grace period)', () => {
    it('accepts a v1 name with future expiry', () => {
      expect(
        isExtendable2LD({ name: 'alice.eth', isV2: false, expiryDate: future }),
      ).toBe(true)
    })

    it('accepts a v1 name within the grace period', () => {
      expect(
        isExtendable2LD({
          name: 'alice.eth',
          isV2: false,
          expiryDate: withinGrace,
        }),
      ).toBe(true)
    })

    it('rejects a v1 name beyond the grace period', () => {
      expect(
        isExtendable2LD({
          name: 'alice.eth',
          isV2: false,
          expiryDate: beyondV1Grace,
        }),
      ).toBe(false)
    })

    it('accepts a v1 name with no expiry (permissive; useCanExtend gates it on-chain)', () => {
      expect(
        isExtendable2LD({ name: 'alice.eth', isV2: false, expiryDate: null }),
      ).toBe(true)
    })
  })
})

describe('getSelectedNames', () => {
  const makeRow = (
    name: string | null,
    isV2 = true,
    expiryDate: Date | null = future,
  ) => ({
    name,
    expiryDate,
    roleBitmap: null,
    v1Roles: isV2 ? null : { owner: true, manager: true },
    protocolVersion: (isV2 ? 'ENSv2' : 'ENSv1') as ProtocolVersion,
  })

  it('maps selected rows to SelectedName shape', () => {
    const rows = [makeRow('alice.eth'), makeRow('bob.eth')]
    const result = getSelectedNames({ 0: true, 1: true }, rows)
    expect(result).toEqual([
      { name: 'alice.eth', isV2: true, expiryDate: future },
      { name: 'bob.eth', isV2: true, expiryDate: future },
    ])
  })

  it('only returns rows matching the selection', () => {
    const rows = [
      makeRow('alice.eth'),
      makeRow('bob.eth'),
      makeRow('carol.eth'),
    ]
    const result = getSelectedNames({ 1: true }, rows)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('bob.eth')
  })

  it('excludes rows with null name', () => {
    const rows = [makeRow(null), makeRow('alice.eth')]
    const result = getSelectedNames({ 0: true, 1: true }, rows)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('alice.eth')
  })

  it('sets isV2 false for v1 names', () => {
    const rows = [makeRow('alice.eth', false)]
    const result = getSelectedNames({ 0: true }, rows)
    expect(result[0].isV2).toBe(false)
  })

  it('returns empty array when nothing is selected', () => {
    const rows = [makeRow('alice.eth')]
    expect(getSelectedNames({}, rows)).toHaveLength(0)
  })

  it('skips out-of-range indices gracefully', () => {
    const rows = [makeRow('alice.eth')]
    const result = getSelectedNames({ 0: true, 5: true }, rows)
    expect(result).toHaveLength(1)
  })
})
