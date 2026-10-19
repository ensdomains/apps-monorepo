import { describe, expect, it } from 'vitest'
import { getNameRowId } from '@/features/names/components/NamesTable/columns'
import type { ProtocolVersion } from '@/utils/types'
import {
  getNameStatus,
  getSelectedNames,
  isExtendable2LD,
  isNonCanonicalEthName,
  MS_PER_DAY,
} from './nameExtension'

const future = new Date(Date.now() + 30 * MS_PER_DAY)
// Grace end, as bigname serves it: still ahead, or already past.
const graceAhead = new Date(Date.now() + 18 * MS_PER_DAY)
const graceOver = new Date(Date.now() - MS_PER_DAY)

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
      expect(isExtendable2LD({ name, isV2: true, graceEndDate: future })).toBe(
        false,
      )
      expect(isExtendable2LD({ name, isV2: false, graceEndDate: future })).toBe(
        false,
      )
    })

    it('still accepts the canonical spelling', () => {
      expect(
        isExtendable2LD({
          name: 'alice.eth',
          isV2: true,
          graceEndDate: future,
        }),
      ).toBe(true)
    })
  })

  describe('non-canonical label rejection (Immunefi #90094)', () => {
    it('rejects a 2LD whose stored label is not its normalised form', () => {
      for (const name of ['ALICE.eth', 'ｆｏｏ.eth', 'foo\u200bbar.eth']) {
        expect(
          isExtendable2LD({ name, isV2: true, graceEndDate: future }),
          name,
        ).toBe(false)
        expect(
          isExtendable2LD({ name, isV2: false, graceEndDate: future }),
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
          graceEndDate: future,
        }),
      ).toBe(false)
    })

    it('rejects a deeply nested subname', () => {
      expect(
        isExtendable2LD({
          name: 'a.b.alice.eth',
          isV2: true,
          graceEndDate: future,
        }),
      ).toBe(false)
    })

    it('rejects a non-.eth name', () => {
      expect(
        isExtendable2LD({
          name: 'alice.com',
          isV2: true,
          graceEndDate: future,
        }),
      ).toBe(false)
    })
  })

  describe('v2 names', () => {
    it('accepts a v2 name before expiry', () => {
      expect(
        isExtendable2LD({
          name: 'alice.eth',
          isV2: true,
          graceEndDate: future,
        }),
      ).toBe(true)
    })

    it('accepts a v2 name within the grace period', () => {
      expect(
        isExtendable2LD({
          name: 'alice.eth',
          isV2: true,
          graceEndDate: graceAhead,
        }),
      ).toBe(true)
    })

    it('rejects a v2 name beyond the grace period', () => {
      expect(
        isExtendable2LD({
          name: 'alice.eth',
          isV2: true,
          graceEndDate: graceOver,
        }),
      ).toBe(false)
    })

    it('rejects a v2 name with no grace end (indexer loading/error)', () => {
      expect(
        isExtendable2LD({ name: 'alice.eth', isV2: true, graceEndDate: null }),
      ).toBe(false)
    })
  })

  describe('v1 names', () => {
    it('accepts a v1 name before expiry', () => {
      expect(
        isExtendable2LD({
          name: 'alice.eth',
          isV2: false,
          graceEndDate: future,
        }),
      ).toBe(true)
    })

    it('accepts a v1 name within the grace period', () => {
      expect(
        isExtendable2LD({
          name: 'alice.eth',
          isV2: false,
          graceEndDate: graceAhead,
        }),
      ).toBe(true)
    })

    it('rejects a v1 name beyond the grace period', () => {
      expect(
        isExtendable2LD({
          name: 'alice.eth',
          isV2: false,
          graceEndDate: graceOver,
        }),
      ).toBe(false)
    })

    it('accepts a v1 name with no grace end (permissive; useCanExtend gates it on-chain)', () => {
      expect(
        isExtendable2LD({ name: 'alice.eth', isV2: false, graceEndDate: null }),
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
    graceEndDate: future,
    status: 'active' as const,
    relations: ['owner', 'manager'] as const,
    protocolVersion: (isV2 ? 'ENSv2' : 'ENSv1') as ProtocolVersion,
  })

  const select = (...rows: ReturnType<typeof makeRow>[]) =>
    Object.fromEntries(
      rows.map((row, index) => [getNameRowId(row, index), true]),
    )

  it('maps selected rows to SelectedName shape', () => {
    const rows = [makeRow('alice.eth'), makeRow('bob.eth')]
    const result = getSelectedNames(select(...rows), rows)
    expect(result).toEqual([
      {
        name: 'alice.eth',
        isV2: true,
        expiryDate: future,
        graceEndDate: future,
      },
      { name: 'bob.eth', isV2: true, expiryDate: future, graceEndDate: future },
    ])
  })

  it('only returns rows matching the selection', () => {
    const rows = [
      makeRow('alice.eth'),
      makeRow('bob.eth'),
      makeRow('carol.eth'),
    ]
    const result = getSelectedNames(select(rows[1]), rows)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('bob.eth')
  })

  // Loading more names re-sorts the list, so a position would end up naming a
  // different row than the one that was ticked.
  it('keeps the selection on the same name when rows move', () => {
    const bob = makeRow('bob.eth')
    const selection = select(bob)

    const result = getSelectedNames(selection, [
      makeRow('aaron.eth'),
      makeRow('alice.eth'),
      bob,
    ])

    expect(result.map((selected) => selected.name)).toEqual(['bob.eth'])
  })

  it('tells an ENSv1 name from an ENSv2 name of the same spelling', () => {
    const v1 = makeRow('alice.eth', false)
    const v2 = makeRow('alice.eth', true)

    const result = getSelectedNames(select(v1), [v2, v1])

    expect(result).toEqual([
      {
        name: 'alice.eth',
        isV2: false,
        expiryDate: future,
        graceEndDate: future,
      },
    ])
  })

  it('excludes rows with null name', () => {
    const rows = [makeRow(null), makeRow('alice.eth')]
    const result = getSelectedNames(
      { [getNameRowId(rows[0], 0)]: true, [getNameRowId(rows[1], 1)]: true },
      rows,
    )
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('alice.eth')
  })

  it('sets isV2 false for v1 names', () => {
    const rows = [makeRow('alice.eth', false)]
    const result = getSelectedNames(select(...rows), rows)
    expect(result[0].isV2).toBe(false)
  })

  it('returns empty array when nothing is selected', () => {
    const rows = [makeRow('alice.eth')]
    expect(getSelectedNames({}, rows)).toHaveLength(0)
  })

  it('ignores a selection that matches no row', () => {
    const rows = [makeRow('alice.eth')]
    const result = getSelectedNames(
      { ...select(...rows), 'ENSv2:gone.eth': true },
      rows,
    )
    expect(result).toHaveLength(1)
  })
})

describe('getNameStatus', () => {
  const daysAgo = (days: number) => new Date(Date.now() - days * MS_PER_DAY)
  const expired = (graceEndDate: Date | null) =>
    getNameStatus({ expiryDate: daysAgo(40), graceEndDate, status: 'expired' })

  it('is registered while bigname serves the name active, even past its expiry', () => {
    // A wrapped ENSv1 subname past its wrapper expiry is still active.
    expect(
      getNameStatus({
        expiryDate: daysAgo(5),
        graceEndDate: null,
        status: 'active',
      }),
    ).toBe('registered')
  })

  it.each([
    { graceEnded: -3, status: 'grace' },
    { graceEnded: 10, status: 'premium' },
    { graceEnded: 30, status: 'expired' },
  ])('is $status for an expired name whose grace ended $graceEnded days ago', ({
    graceEnded,
    status,
  }) => {
    expect(expired(daysAgo(graceEnded))).toBe(status)
  })

  it('is in price cooldown for a name bigname released when its grace ended', () => {
    expect(
      getNameStatus({
        expiryDate: daysAgo(100),
        graceEndDate: daysAgo(10),
        status: 'released',
      }),
    ).toBe('premium')
  })

  it('is expired for an expired name with no grace', () => {
    expect(expired(null)).toBe('expired')
  })

  it('is no-expiry without an expiry', () => {
    expect(
      getNameStatus({ expiryDate: null, graceEndDate: null, status: 'active' }),
    ).toBe('no-expiry')
  })
})
