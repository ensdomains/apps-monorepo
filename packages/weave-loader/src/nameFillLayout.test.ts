import { describe, expect, it } from 'vitest'
import { withLabelBreaks } from './nameFillLayout'

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
