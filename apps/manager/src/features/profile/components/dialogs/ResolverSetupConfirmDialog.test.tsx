import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { ResolverSetupConfirmDialog } from './ResolverSetupConfirmDialog'

describe('ResolverSetupConfirmDialog', () => {
  it('offers a plain continue when nothing is replaced', () => {
    render(
      <ResolverSetupConfirmDialog
        intent="primary-name"
        isReplacing={false}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open
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
        isReplacing
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open
      />,
    )

    const button = screen.getByRole('button', { name: 'Replace & Continue' })
    expect(button).toHaveClass('bg-destructive')
    expect(
      screen.getByText(/keep only your wallet address/),
    ).toBeInTheDocument()
  })
})
