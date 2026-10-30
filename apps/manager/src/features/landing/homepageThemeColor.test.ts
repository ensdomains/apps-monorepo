import { describe, expect, it } from 'vitest'
import { getThemeVars } from '@/features/profile/utils/themeColor'
import { homepageThemeColor } from './homepageThemeColor'

describe('homepageThemeColor', () => {
  it.each([undefined, null, '', '   ', '\n\t'])(
    'returns undefined when the theme record is missing or blank (%s)',
    (record) => {
      expect(homepageThemeColor(record)).toBeUndefined()
    },
  )

  it.each(['#E72A96', ' #ed2496 ', '#0080BC', 'red'])(
    'resolves a present theme record through getThemeVars (%s)',
    (record) => {
      expect(homepageThemeColor(record)).toBe(
        getThemeVars(record)['--theme-color'],
      )
    },
  )
})
