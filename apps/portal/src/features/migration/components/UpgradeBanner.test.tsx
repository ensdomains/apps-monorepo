import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UpgradeBanner } from './UpgradeBanner'

describe('UpgradeBanner', () => {
  it('offers a plain upgrade for a name that is not wrapped', () => {
    render(<UpgradeBanner name="jooooe.eth" />)

    expect(
      screen.getByText(/reserved on ENS v2 until it is migrated/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Upgrade to v2/ }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/must be unwrapped/)).not.toBeInTheDocument()
  })

  // An unlocked wrapped name leaves the NameWrapper as part of the upgrade, so
  // the banner says so and the CTA names both steps.
  it('tells the holder of a wrapped name it is unwrapped on the way', () => {
    render(<UpgradeBanner name="jooooe.eth" isWrapped />)

    expect(
      screen.getByText(
        'This wrapped name must be unwrapped before it can be migrated to ENS v2',
      ),
    ).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: /Unwrap and upgrade/ })
    expect(cta.getAttribute('href')).toMatch(/\/migration$/)
    expect(screen.queryByText(/Upgrade to v2/)).not.toBeInTheDocument()
  })
})
