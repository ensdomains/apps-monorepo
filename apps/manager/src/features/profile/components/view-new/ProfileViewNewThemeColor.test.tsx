import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ProfileViewNewThemeColorProvider,
  useProfileViewNewThemeColor,
} from './ProfileViewNewThemeColor'

const ThemeColorProbe = () => (
  <output data-testid="theme-color">
    {useProfileViewNewThemeColor() ?? ''}
  </output>
)

describe('ProfileViewNewThemeColor', () => {
  it('returns undefined without a profile theme provider', () => {
    render(<ThemeColorProbe />)

    expect(screen.getByTestId('theme-color').textContent).toBe('')
  })

  it('returns the nearest profile theme color from context', () => {
    render(
      <ProfileViewNewThemeColorProvider value="#E72A96">
        <ThemeColorProbe />
      </ProfileViewNewThemeColorProvider>,
    )

    expect(screen.getByTestId('theme-color').textContent).toBe('#E72A96')
  })
})
