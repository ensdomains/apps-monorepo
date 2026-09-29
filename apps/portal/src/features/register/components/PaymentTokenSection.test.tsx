import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PaymentTokenSection } from './PaymentTokenSection'

// No token is ever selected, as after a reload.
vi.mock('./PaymentTokenPicker', () => ({ PaymentTokenPicker: () => null }))

const renderSection = (
  props: Partial<Parameters<typeof PaymentTokenSection>[0]>,
) =>
  render(
    <PaymentTokenSection
      name="leon.eth"
      duration={31_536_000}
      onConfirm={vi.fn()}
      isConnected
      {...props}
    />,
  )

describe('PaymentTokenSection', () => {
  it('reopens a registration under way without a token selected', () => {
    const onViewProgress = vi.fn()
    renderSection({ isRegistering: true, onViewProgress })

    expect(screen.queryByRole('button', { name: 'Register' })).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'View registration progress' }),
    )

    expect(onViewProgress).toHaveBeenCalledOnce()
  })

  it('offers both a fresh start and the failed run', () => {
    renderSection({ isRegistering: false, onViewProgress: vi.fn() })

    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'View registration progress' }),
    ).toBeEnabled()
  })

  it('shows only Register when there is no run', () => {
    renderSection({})

    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'View registration progress' }),
    ).toBeNull()
  })
})
