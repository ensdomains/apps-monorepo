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
})
