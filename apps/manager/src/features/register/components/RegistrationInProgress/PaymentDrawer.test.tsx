import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CreditCardPaymentDrawer } from './PaymentDrawer'

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}))

vi.mock('@ens-apps/transaction-manager', () => ({}))
vi.mock('@getpara/react-sdk-lite', () => ({
  useWallet: () => ({}),
}))

describe('CreditCardPaymentDrawer', () => {
  it('renders trigger button', () => {
    render(<CreditCardPaymentDrawer />)
    expect(
      screen.getByRole('button', { name: /pay with credit card/i }),
    ).toBeInTheDocument()
  })

  it('accepts onPaymentSelect prop', () => {
    const onPaymentSelect = vi.fn()
    render(<CreditCardPaymentDrawer onPaymentSelect={onPaymentSelect} />)
    expect(
      screen.getByRole('button', { name: /pay with credit card/i }),
    ).toBeInTheDocument()
  })

  it('renders with custom domain and duration props', () => {
    render(
      <CreditCardPaymentDrawer
        domainName="custom.eth"
        duration={5}
        priceUSD={100}
      />,
    )
    expect(
      screen.getByRole('button', { name: /pay with credit card/i }),
    ).toBeInTheDocument()
  })
})
