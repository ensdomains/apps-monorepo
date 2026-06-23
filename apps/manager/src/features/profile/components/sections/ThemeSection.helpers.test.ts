import { describe, expect, it } from 'vitest'
import { getSelectedThemeColor } from './ThemeSection.helpers'

describe('getSelectedThemeColor', () => {
  it('does not select the default theme when no theme is saved', () => {
    expect(getSelectedThemeColor('')).toBe('')
  })

  it('resolves saved legacy theme colors to the updated palette', () => {
    expect(getSelectedThemeColor('#0080BC')).toBe('#0082BB')
  })
})
