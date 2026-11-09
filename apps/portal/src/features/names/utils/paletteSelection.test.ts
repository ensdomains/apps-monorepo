import { describe, expect, it } from 'vitest'
import {
  isSamePaletteSelection,
  type PaletteNameRow,
  selectPaletteNameRows,
} from './paletteSelection'

const NOW = new Date('2030-06-01T12:00:00Z')
const row = (
  id: string,
  overrides: Partial<PaletteNameRow> = {},
): PaletteNameRow => ({
  id,
  isSelectable: true,
  expiryDate: new Date('2030-06-15T12:00:00Z'),
  graceEndDate: new Date('2030-09-15T12:00:00Z'),
  status: 'active',
  ...overrides,
})

describe('palette name selection', () => {
  it('allows sorting but rejects replacement targets even when the selected count is unchanged', () => {
    expect(isSamePaletteSelection(['alice', 'bob'], ['bob', 'alice'])).toBe(
      true,
    )
    expect(isSamePaletteSelection(['alice', 'bob'], ['alice', 'carol'])).toBe(
      false,
    )
    expect(isSamePaletteSelection(['alice', 'bob'], ['alice'])).toBe(false)
  })
  it('selects only selectable identities from the supplied scope', () => {
    expect(
      selectPaletteNameRows({
        rows: [row('shown'), row('blocked', { isSelectable: false })],
        mode: 'shown',
        now: NOW,
      }),
    ).toEqual({ shown: true })
  })

  it.each([
    {
      mode: 'expiring' as const,
      expected: { soon: true },
    },
    {
      mode: 'grace' as const,
      expected: { grace: true },
    },
  ])('uses the existing status semantics for $mode', ({ mode, expected }) => {
    expect(
      selectPaletteNameRows({
        rows: [
          row('soon'),
          row('later', { expiryDate: new Date('2030-08-01T00:00:00Z') }),
          row('grace', {
            expiryDate: new Date('2030-05-01T00:00:00Z'),
            status: 'expired',
          }),
          row('unselectable', { isSelectable: false }),
          row('no-expiry', { expiryDate: null }),
          row('released', {
            status: 'released',
            expiryDate: new Date('2030-05-01T00:00:00Z'),
            graceEndDate: new Date('2030-05-15T00:00:00Z'),
          }),
        ],
        mode,
        now: NOW,
      }),
    ).toEqual(expected)
  })
})
