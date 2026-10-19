import { withLabelBreaks } from '@ens-apps/weave-loader/nameFillLayout'
import { describe, expect, it } from 'vitest'

const ZWSP = '​'

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
