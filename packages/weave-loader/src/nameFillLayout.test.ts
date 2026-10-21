import { describe, expect, it } from 'vitest'
import { withLabelBreaks, withoutLabelBreaks } from './nameFillLayout'

const ZWSP = '\u200b'

describe('withLabelBreaks', () => {
  it('adds a break opportunity after each label dot', () => {
    expect(withLabelBreaks('sub.young-badger.eth')).toBe(
      `sub.${ZWSP}young-badger.${ZWSP}eth`,
    )
  })

  it('leaves names without dots alone', () => {
    expect(withLabelBreaks('averylonglabel')).toBe('averylonglabel')
  })

  it('ignores a trailing dot', () => {
    expect(withLabelBreaks('name.eth.')).toBe(`name.${ZWSP}eth.`)
  })
})

describe('withoutLabelBreaks', () => {
  it('restores the name withLabelBreaks rendered', () => {
    expect(withoutLabelBreaks(withLabelBreaks('sub.young-badger.eth'))).toBe(
      'sub.young-badger.eth',
    )
  })

  // A copy can cover part of the name, or run past it into other text.
  it('keeps the rest of a selection as selected', () => {
    expect(withoutLabelBreaks(`badger.${ZWSP}eth is yours`)).toBe(
      'badger.eth is yours',
    )
  })
})
