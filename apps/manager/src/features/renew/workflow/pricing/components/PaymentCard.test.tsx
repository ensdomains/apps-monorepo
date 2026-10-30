import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useRenewalSigner: vi.fn(),
  gate: vi.fn(),
  send: vi.fn(),
}))

vi.mock('@/features/renew/hooks/useRenewalSigner', () => ({
  useRenewalSigner: mocks.useRenewalSigner,
}))
vi.mock('@/features/renew/state/renewalUi.context', () => ({
  useRenewalUiContext: () => ({
    uiActor: { send: mocks.send },
    label: 'name',
    protocol: 'v2',
  }),
}))
vi.mock('@xstate/react', () => ({ useSelector: () => [31_536_000n, true] }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: 5, isLoading: false, isPlaceholderData: false }),
}))
vi.mock('@/features/register-v2/data/queries/baseRates.query', () => ({
  useBaseRate: () => 0n,
}))
vi.mock('@/features/wallet/hooks/useSmartSessionGate', () => ({
  useSmartSessionGate: () => ({ gate: mocks.gate, sessionModal: null }),
}))
vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContext: () => ({ isConnected: true }),
}))
vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnection: () => ({ isConnected: true }),
}))
vi.mock('@/lib/wallet', () => ({
  useConnectModal: () => ({ connectModalOpen: false }),
  useWalletDisconnect: () => ({}),
}))

import { PaymentCard } from './PaymentCard'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const payButton = () => {
  render(
    <I18nProvider i18n={i18n}>
      <PaymentCard />
    </I18nProvider>,
  )
  return screen.getByRole('button', { name: /pay with stablecoins/i })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('renewal PaymentCard (ENSv2)', () => {
  it('waits for the Safe check before anything can reach the session prompt', () => {
    mocks.useRenewalSigner.mockReturnValue(null)

    expect(payButton()).toBeDisabled()
  })

  it('takes a Safe{Wallet} to the token picker without the session gate', () => {
    mocks.useRenewalSigner.mockReturnValue({ type: 'eoa' })

    fireEvent.click(payButton())

    expect(mocks.gate).not.toHaveBeenCalled()
    expect(mocks.send).toHaveBeenCalledWith({ type: 'pricing.step.next' })
  })
})
