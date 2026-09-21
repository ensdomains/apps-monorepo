import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PaymentCard } from './PaymentCard'

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  send: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: Symbol('keepPreviousData'),
  useQuery: () => ({
    data: { basePrice: 330, premiumPrice: 0, totalPrice: 330 },
    isLoading: false,
    isPlaceholderData: false,
  }),
}))

vi.mock('@xstate/react', () => ({
  useSelector: () => [31_536_000, true],
}))

vi.mock('@/features/register-v2/data/queries/baseRates.query', () => ({
  useBaseRate: () => 0,
}))

vi.mock('@/features/register-v2/utils/discount', () => ({
  calculateDiscount: () => ({ discountAmount: 0 }),
}))

vi.mock('@/features/wallet/hooks/useSmartSessionGate', () => ({
  useSmartSessionGate: () => ({ gate: mocks.gate, sessionModal: null }),
}))

vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContext: () => ({ isConnected: true }),
}))

vi.mock('@/lib/wallet', () => ({
  useConnectModal: () => ({ connectModalOpen: false, openConnectModal: vi.fn() }),
}))

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnection: () => ({ isConnected: true }),
}))

vi.mock('../../../state/registrationUi.context', () => ({
  useRegistrationV2Context: () => ({
    label: 'jeff',
    uiActor: { send: mocks.send },
  }),
}))

i18n.loadAndActivate({ locale: 'en', messages: {} })

describe('PaymentCard', () => {
  beforeEach(() => {
    mocks.gate.mockClear()
    mocks.send.mockClear()
  })

  it('opens the payment chooser without requiring a smart session', () => {
    render(
      <I18nProvider i18n={i18n}>
        <PaymentCard />
      </I18nProvider>,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Pay with stablecoins' }),
    )

    expect(mocks.send).toHaveBeenCalledWith({ type: 'pricing.step.next' })
    expect(mocks.gate).not.toHaveBeenCalled()
  })

  it('advertises both supported stablecoins', () => {
    render(
      <I18nProvider i18n={i18n}>
        <PaymentCard />
      </I18nProvider>,
    )

    const acceptedStables = screen.getByRole('list', {
      name: 'Stables accepted',
    })
    expect(acceptedStables).toContainElement(
      screen.getByRole('listitem', { name: 'USDC' }),
    )
    expect(acceptedStables).toContainElement(
      screen.getByRole('listitem', { name: 'DAI' }),
    )
  })
})
