import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useRenewalSigner: vi.fn(),
  gate: vi.fn(),
  send: vi.fn(),
  protocol: 'v2' as 'v1' | 'v2',
}))

vi.mock('@/features/renew/hooks/useRenewalSigner', () => ({
  useRenewalSigner: mocks.useRenewalSigner,
}))
vi.mock('@/features/renew/state/renewalUi.context', () => ({
  useRenewalUiContext: () => ({
    uiActor: { send: mocks.send },
    label: 'name',
    protocol: mocks.protocol,
  }),
}))
vi.mock('@xstate/react', () => ({ useSelector: () => [31_536_000n, true] }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({
    data: { amount: 5_000_000n },
    isLoading: false,
    isPlaceholderData: false,
  }),
}))
vi.mock(
  '@/features/register-v2/workflow/pricing/hooks/useCheckoutSources',
  () => ({
    useCheckoutSources: () => ({
      accountBalance: { status: 'known', usdcRaw: 0n },
      sources: { wallet: { status: 'known', usdcRaw: 10_000_000n }, l2s: [] },
    }),
  }),
)
vi.mock('@/features/register-v2/data/queries/baseRates.query', () => ({
  useBaseRate: () => 0n,
}))
vi.mock('@/features/wallet/hooks/useSmartSessionGate', () => ({
  useSmartSessionGate: () => ({ gate: mocks.gate, sessionModal: null }),
}))
vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContext: () => ({ isConnected: true, hasInitialized: true }),
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

const renderCard = () =>
  render(
    <I18nProvider i18n={i18n}>
      <PaymentCard />
    </I18nProvider>,
  )

const payButton = () => {
  renderCard()
  return screen.getByRole('button', { name: /^continue to payment$/i })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.protocol = 'v2'
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

  it('holds the total as a placeholder until the signer, and so the balance it applies, is known', () => {
    mocks.useRenewalSigner.mockReturnValue(null)

    renderCard()

    expect(screen.getByText('$00.00')).toHaveAttribute('aria-hidden', 'true')
  })

  it('accepts ETH for a V1 renewal paid from the smart account', () => {
    mocks.protocol = 'v1'
    mocks.useRenewalSigner.mockReturnValue({ type: 'rhinestone' })

    renderCard()

    expect(screen.getByAltText('ETH')).toBeVisible()
  })
})
