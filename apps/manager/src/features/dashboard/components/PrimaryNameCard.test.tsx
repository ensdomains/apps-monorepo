import { screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { PrimaryNameCard } from './PrimaryNameCard'

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return { ...actual, useQuery: () => ({ data: null, isLoading: false }) }
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

vi.mock('./ChoosePrimaryNameDialog', () => ({
  ChoosePrimaryNameDialog: ({ children }: { readonly children?: ReactNode }) =>
    children,
}))

describe('PrimaryNameCard', () => {
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
    const metadataColumn = nameplate?.parentElement
    const cardContent = metadataColumn?.parentElement

    expect(nameText).toHaveClass('min-w-0', 'wrap-anywhere')
    expect(nameplate).toHaveClass('max-w-full', 'self-start')
    expect(metadataColumn).toHaveClass('min-w-0')
    expect(cardContent).toHaveClass('min-w-0')
  })
})
