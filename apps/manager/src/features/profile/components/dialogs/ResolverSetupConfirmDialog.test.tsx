import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { ResolverSetupConfirmDialog } from './ResolverSetupConfirmDialog'

describe('ResolverSetupConfirmDialog', () => {
  it('shows every reviewed record key and complete value before a replacement can be confirmed', () => {
    const onConfirm = vi.fn()
    render(
      <ResolverSetupConfirmDialog
        intent="edit-profile"
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
        open
        recordWrites={[
          { key: 'text:description', value: 'My description\nSecond line' },
          {
            key: 'addr:60',
            value: '0x1111111111111111111111111111111111111111',
          },
        ]}
        replaces="resolver"
      />,
    )
    const list = screen.getByRole('list', { name: 'Records to write' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByText('text:description')).toBeVisible()
    expect(within(list).getByText('My description Second line')).toBeVisible()
    expect(within(list).getByText('addr:60')).toBeVisible()
    expect(
      within(list).getByText('0x1111111111111111111111111111111111111111'),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Replace & Save' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('confirms an explicitly reviewed empty replacement and explains that existing records are cleared', () => {
    const onConfirm = vi.fn()
    render(
      <ResolverSetupConfirmDialog
        intent="edit-profile"
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
        open
        recordWrites={[]}
        replaces="resolver"
      />,
    )
    expect(screen.getByText(/No profile records will be kept/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Replace & Save' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('cannot confirm a profile replacement without a record review', () => {
    render(
      <ResolverSetupConfirmDialog
        intent="edit-profile"
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open
        replaces="resolver"
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Replace & Save' }),
    ).toBeDisabled()
  })

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
