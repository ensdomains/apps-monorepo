import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { ResolverSetupConfirmDialog } from './ResolverSetupConfirmDialog'

describe('ResolverSetupConfirmDialog', () => {
  it('offers a plain continue when nothing is replaced', () => {
    render(
      <ResolverSetupConfirmDialog
        intent="primary-name"
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open
        replaces="nothing"
      />,
    )

    const button = screen.getByRole('button', { name: 'Continue' })
    expect(button).toHaveClass('bg-ens-blue')
    expect(screen.queryByText(/keep only your wallet address/)).toBeNull()
  })

  it('warns about replacing when something is', () => {
    render(
      <ResolverSetupConfirmDialog
        intent="primary-name"
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open
        replaces="resolver"
      />,
    )

    const button = screen.getByRole('button', { name: 'Replace & Continue' })
    expect(button).toHaveClass('bg-destructive')
    expect(
      screen.getByText(/keep only your wallet address/),
    ).toBeInTheDocument()
  })

  // Nothing readable lives on a non-resolver, so say why it goes rather than
  // warning that something is being overwritten.
  it.each([
    { intent: 'primary-name', confirmLabel: 'Replace & Continue' },
    { intent: 'edit-profile', confirmLabel: 'Replace & Save' },
  ] as const)(
    'explains an invalid resolver for $intent',
    ({ intent, confirmLabel }) => {
      render(
        <ResolverSetupConfirmDialog
          intent={intent}
          onConfirm={vi.fn()}
          onOpenChange={vi.fn()}
          open
          replaces="invalid-resolver"
        />,
      )

      expect(screen.getByText(/isn’t a working resolver/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: confirmLabel })).toHaveClass(
        'bg-ens-blue',
      )
    },
  )
})
