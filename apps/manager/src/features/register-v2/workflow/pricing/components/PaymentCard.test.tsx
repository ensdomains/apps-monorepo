import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PaymentCardBase } from './PaymentCard'

vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContext: () => ({ isConnected: true }),
}))
vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnection: () => ({ isConnected: true }),
}))
vi.mock('@/lib/wallet', () => ({
  useConnectModal: () => ({ connectModalOpen: false }),
  useWalletDisconnect: () => ({ disconnect: vi.fn() }),
}))

i18n.loadAndActivate({ locale: 'en', messages: {} })

const renderCard = (
  overrides: Partial<Parameters<typeof PaymentCardBase>[0]> = {},
) => {
  const onEth = vi.fn()
  const onNext = vi.fn()
  render(
    <I18nProvider i18n={i18n}>
      <PaymentCardBase
        amount={20}
        canNext
        isLoading={false}
        onEth={onEth}
        onNext={onNext}
        type="register"
        {...overrides}
      />
    </I18nProvider>,
  )
  return { onEth, onNext }
}

describe('registration payment choices', () => {
  it('puts the Ethereum option below stablecoins and dispatches its own action', () => {
    const { onEth, onNext } = renderCard()
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Pay with stablecoins',
      'Pay with ETH',
    ])
    expect(buttons[1]?.querySelector('img')?.getAttribute('src')).toContain(
      'svg',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pay with ETH' }))
    expect(onEth).toHaveBeenCalledOnce()
    expect(onNext).not.toHaveBeenCalled()
  })

  it('disables both payment options until the duration is valid', () => {
    renderCard({ canNext: false })
    expect(screen.getByRole('button', { name: 'Pay with ETH' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Pay with stablecoins' }),
    ).toBeDisabled()
  })

  it('does not add an ETH option to a checkout that did not request it', () => {
    renderCard({ onEth: undefined, type: 'renew' })
    expect(
      screen.queryByRole('button', { name: 'Pay with ETH' }),
    ).not.toBeInTheDocument()
  })
})
