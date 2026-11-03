import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProfileExpiryResult } from '@/features/profile/service/profileExpiry'
import { copyToClipboard } from '@/lib/clipboard'
import { render } from '@/utils/test-utils'
import { formatDashboardDate } from '../utils'
import { PrimaryNameCard } from './PrimaryNameCard'

const mocks = vi.hoisted(() => ({
  expiry: null as ProfileExpiryResult | null,
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: ({
      queryKey: [key],
    }: {
      readonly queryKey: readonly [{ readonly $action?: string }]
    }) => ({
      data: key.$action === 'expiry' ? mocks.expiry : null,
      isLoading: false,
    }),
  }
})

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: { readonly children: ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
  useReducedMotion: () => true,
}))

vi.mock('@/components/ui/button', () => ({
  LinkButton: ({ children }: { readonly children: ReactNode }) => (
    <a href="/alpha.eth">{children}</a>
  ),
}))

vi.mock('@/lib/clipboard', () => ({ copyToClipboard: vi.fn() }))

vi.mock('./ChoosePrimaryNameDialog', () => ({
  ChoosePrimaryNameDialog: ({ children }: { readonly children?: ReactNode }) =>
    children,
}))

describe('PrimaryNameCard', () => {
  afterEach(() => {
    mocks.expiry = null
    vi.useRealTimers()
  })

  it('shows when a primary name in grace expired, and under it when grace ends', () => {
    const expiresAt = new Date('2026-10-20T12:00:00Z')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'))
    mocks.expiry = {
      expiry: BigInt(expiresAt.getTime() / 1000),
      isNonExpiring: false,
      protocol: 'v2',
    }

    render(<PrimaryNameCard primaryName="alpha.eth" />)

    expect(screen.getByText('Expires').nextElementSibling).toHaveTextContent(
      formatDashboardDate(expiresAt),
    )
    expect(
      screen.getByText('Grace period ends').nextElementSibling,
    ).toHaveTextContent(formatDashboardDate(new Date('2026-11-17T12:00:00Z')))
  })

  it('uses only the label button as chooser trigger and leaves the value plain', () => {
    render(<PrimaryNameCard primaryName="alpha.eth" />)

    expect(
      screen.getByRole('button', { name: 'Primary Name' }),
    ).toBeInTheDocument()
    const displayedName = screen.getByText('alpha.eth')
    expect(displayedName.closest('button')).toBeNull()
    expect(displayedName.closest('a')).toBeNull()
    expect(screen.queryByText('keyboard_arrow_down')).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /go to profile/i }),
    ).toBeInTheDocument()
  })

  it('keeps a short configured-name background content-sized', () => {
    render(<PrimaryNameCard primaryName="ens.eth" />)

    const nameplate = screen.getByText('ens.eth').parentElement

    expect(nameplate).toHaveClass('inline-flex', 'max-w-full', 'self-start')
    expect(nameplate).toHaveClass('bg-(--theme-color)')
  })

  it('allows a long unbroken configured name to wrap at narrow widths', () => {
    const longName = `${'a'.repeat(63)}.eth`
    render(
      // 390px matches the requested mobile viewport for this narrow-layout regression.
      <div className="w-[390px]">
        <PrimaryNameCard primaryName={longName} />
      </div>,
    )

    const nameText = screen.getByText(longName)
    const nameplate = nameText.parentElement
    const nameRow = nameplate?.parentElement
    const metadataColumn = nameRow?.parentElement
    const cardContent = metadataColumn?.parentElement

    expect(nameText).toHaveClass('min-w-0', 'wrap-anywhere')
    expect(nameplate).toHaveClass('max-w-full', 'self-start')
    expect(nameRow).toHaveClass('min-w-0')
    expect(metadataColumn).toHaveClass('min-w-0')
    expect(cardContent).toHaveClass('min-w-0')
  })

  it('copies the primary name from the button beside the nameplate', async () => {
    render(<PrimaryNameCard primaryName="alpha.eth" />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'alpha.eth — Copy to clipboard',
      }),
    )

    await waitFor(() =>
      expect(copyToClipboard).toHaveBeenCalledWith('alpha.eth'),
    )
  })

  it('offers no copy button while the card shows the placeholder', () => {
    render(<PrimaryNameCard primaryName={null} />)

    expect(
      screen.queryByRole('button', { name: /Copy to clipboard/ }),
    ).not.toBeInTheDocument()
  })
})
