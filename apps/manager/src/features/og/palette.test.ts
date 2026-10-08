import { describe, expect, it } from 'vitest'
import { PROFILE_THEMES } from '@/features/profile/constants'
import { getOgPalette } from './palette'

describe('getOgPalette', () => {
  it('takes the chip fill from the theme the record names', () => {
    expect(getOgPalette('#E72A96').chipBackground).toBe('#E72A96')
    expect(getOgPalette('#E72A96').text).toBe('#5a0024')
  })

  it('resolves a theme alias to its canonical palette', () => {
    expect(getOgPalette('#ED2496')).toEqual(getOgPalette('#E72A96'))
  })

  it('falls back to the app default for a missing or unknown theme', () => {
    const fallback = getOgPalette(undefined)

    expect(fallback.chipBackground).toBe('#0082BB')
    expect(getOgPalette('not-a-colour')).toEqual(fallback)
  })

  it('covers every profile theme', () => {
    for (const theme of PROFILE_THEMES) {
      expect(getOgPalette(theme.value).chipBackground).toBe(theme.value)
      expect(getOgPalette(theme.value).chipText).toBe('#ffffff')
    }
  })
})
