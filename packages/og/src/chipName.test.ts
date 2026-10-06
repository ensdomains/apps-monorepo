import { describe, expect, it } from 'vitest'
import { fitOgChipName } from './chipName'

describe('fitOgChipName', () => {
  it('hugs the chip around a name that fits one line', () => {
    expect(fitOgChipName('jooooe.eth', true)).toEqual({
      isWide: false,
      text: 'jooooe.eth',
    })
  })

  it('fits more characters per line when there is no avatar', () => {
    const name = `${'a'.repeat(21)}.eth` // 25 chars

    expect(fitOgChipName(name, true).isWide).toBe(true)
    expect(fitOgChipName(name, false).isWide).toBe(false)
  })

  it('widens the chip for a name that needs a second line', () => {
    const name = 'thebesteverdeathmetalband.eth'

    expect(fitOgChipName(name, true)).toEqual({ isWide: true, text: name })
  })

  it('ellipsises a name that would run past two lines, keeping the TLD', () => {
    const { isWide, text } = fitOgChipName(
      'thebesteverdeathmetalbandindentonneversettleforless.eth',
      true,
    )

    expect(isWide).toBe(true)
    expect(text).toBe('thebesteverdeathmetalbandindentonneversett…eth')
    expect(text.length).toBeLessThanOrEqual(46)
  })

  it('ellipsises a name with no TLD', () => {
    const { text } = fitOgChipName('b'.repeat(80), true)

    expect(text).toBe(`${'b'.repeat(45)}…`)
  })

  it('fits to the metrics a card passes in', () => {
    const metrics = {
      charWidth: 50,
      maxLines: 3,
      textWidth: 500,
      textWidthWithAvatar: 300,
    }
    const name = `${'c'.repeat(20)}.eth` // 24 chars

    expect(fitOgChipName('abcdef.eth', false, metrics).isWide).toBe(false)
    expect(fitOgChipName('abcdef.eth', true, metrics).isWide).toBe(true)
    // 6 chars per line beside the avatar, 3 lines: 18 chars at most.
    expect(fitOgChipName(name, true, metrics).text).toBe(
      `${'c'.repeat(14)}…eth`,
    )
    // 10 per line without it: 24 chars still fit 3 lines.
    expect(fitOgChipName(name, false, metrics).text).toBe(name)
  })
})
