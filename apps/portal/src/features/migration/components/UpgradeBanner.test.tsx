import { render, screen } from '@testing-library/react'
import { okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils/providers'
import { describeUpgrade, UpgradeBanner } from './UpgradeBanner'

const impact = vi.hoisted(() => ({ affectedCount: 0 }))

vi.mock('@ens-apps/migration', () => ({
  getSubnameMigrationImpact: () =>
    okAsync({
      affectedCount: impact.affectedCount,
      parents: [],
      fingerprint: 'f',
      checkedAt: 0,
    }),
}))

describe('UpgradeBanner', () => {
  beforeEach(() => {
    impact.affectedCount = 0
  })

  it('offers a plain upgrade for a name that is not wrapped', () => {
    render(<UpgradeBanner name="jooooe.eth" />, {
      wrapper: createTestWrapper(),
    })

    expect(
      screen.getByText(/reserved on ENS v2 until it is upgraded/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Upgrade to v2/ }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/must be unwrapped/)).not.toBeInTheDocument()
  })

  // An unlocked wrapped name leaves the NameWrapper as part of the upgrade, so
  // the banner says so and the CTA names both steps.
  it('tells the holder of a wrapped name it is unwrapped on the way', () => {
    render(<UpgradeBanner name="jooooe.eth" isWrapped />, {
      wrapper: createTestWrapper(),
    })

    expect(
      screen.getByText(
        'This wrapped name must be unwrapped before it can be upgraded to ENS v2',
      ),
    ).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: /Unwrap and upgrade/ })
    expect(cta.getAttribute('href')).toMatch(/\/upgrade$/)
    expect(screen.queryByText(/Upgrade to v2/)).not.toBeInTheDocument()
  })

  it('replaces the sentence with the subname impact once it is known', async () => {
    impact.affectedCount = 5
    render(<UpgradeBanner name="jooooe.eth" isWrapped />, {
      wrapper: createTestWrapper(),
    })

    expect(
      await screen.findByText(
        'This name is reserved on ENS v2 until it is migrated from ENS v1. Upgrading this name on its own would delete 5 subnames. Review which subnames will be carried over in Manager before continuing.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/must be unwrapped/)).not.toBeInTheDocument()
  })

  it('keeps the base sentence and points at Manager when the check fails', () => {
    expect(
      describeUpgrade({ isWrapped: false, impact: { status: 'error' } }),
    ).toBe(
      'This name is reserved on ENS v2 until it is upgraded from ENS v1. Subname impact could not be checked here. Review it in Manager before upgrading.',
    )
    expect(
      describeUpgrade({
        isWrapped: true,
        impact: { status: 'ready', affectedCount: 1 },
      }),
    ).toMatch(/would delete 1 subname\./)
  })
})
