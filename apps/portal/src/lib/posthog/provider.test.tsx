import { boot, trackEvent, update } from '@intercom/messenger-js-sdk'
import { act, render } from '@testing-library/react'
import posthog from 'posthog-js/dist/module.full.no-external'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnectionEffect } from 'wagmi'
import { INTERCOM_APP_ID } from '@/lib/intercom'
import { POSTHOG_CONFIG, setAnalyticsConsent } from './config'
import { PHProvider } from './provider'

vi.mock('@intercom/messenger-js-sdk', () => ({
  boot: vi.fn(),
  getVisitorId: vi.fn(),
  trackEvent: vi.fn(),
  update: vi.fn(),
}))
vi.mock('@posthog/react', () => ({
  PostHogProvider: ({ children }: { children: unknown }) => children,
}))
// The answer PostHog keeps in its cookie.
const consent = vi.hoisted(() => ({ stored: 'pending' }))
vi.mock('posthog-js/dist/module.full.no-external', () => ({
  default: {
    __loaded: true,
    init: vi.fn(),
    identify: vi.fn(),
    register: vi.fn(),
    capture: vi.fn(),
    reset: vi.fn(() => {
      consent.stored = 'pending'
    }),
    get_distinct_id: vi.fn(() => 'distinct-id'),
    get_session_replay_url: vi.fn(() => 'replay-url'),
    get_explicit_consent_status: () => consent.stored,
    get_property: vi.fn(),
    opt_in_capturing: vi.fn(() => {
      consent.stored = 'granted'
    }),
    opt_out_capturing: vi.fn(() => {
      consent.stored = 'denied'
    }),
    set_config: vi.fn(),
  },
}))
vi.mock('wagmi', () => ({ useConnectionEffect: vi.fn() }))

const WALLET = {
  address: '0x1111111111111111111111111111111111111111',
  chainId: 1,
  connector: { name: 'test-wallet' },
}

const renderProvider = () =>
  render(
    <PHProvider>
      <div>child</div>
    </PHProvider>,
  )

const connectionCallbacks = () => {
  const callbacks = vi.mocked(useConnectionEffect).mock.calls[0]?.[0]
  if (!callbacks) throw new Error('Missing connection callbacks')
  return callbacks
}

const connectWallet = () => {
  const callbacks = connectionCallbacks()
  callbacks.onConnect?.(
    WALLET as Parameters<NonNullable<typeof callbacks.onConnect>>[0],
  )
  return callbacks
}

describe('PostHog provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    consent.stored = 'pending'
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'test-key')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('initializes PostHog with the consent-gated config', () => {
    renderProvider()
    expect(posthog.init).toHaveBeenCalledWith(
      'test-key',
      expect.objectContaining(POSTHOG_CONFIG),
    )
  })

  it('links Intercom to analytics only with consent, including after Accept', () => {
    renderProvider()
    expect(boot).toHaveBeenCalledWith({ app_id: INTERCOM_APP_ID })
    expect(update).not.toHaveBeenCalled()

    act(() => setAnalyticsConsent(posthog, true))
    expect(update).toHaveBeenCalledWith({
      posthog_distinct_id: 'distinct-id',
      recent_replay: 'replay-url',
    })
  })

  it('tracks wallet connects and keeps consent after the disconnect reset', () => {
    setAnalyticsConsent(posthog, true)
    renderProvider()
    const callbacks = connectWallet()

    expect(posthog.identify).toHaveBeenCalledWith(
      WALLET.address,
      { address: WALLET.address },
      { initial_address: WALLET.address },
    )
    expect(posthog.capture).toHaveBeenCalledWith('wallet:connect', {
      wallet_address: WALLET.address,
      chain_id: 1,
      wallet_connector: 'test-wallet',
    })
    expect(trackEvent).toHaveBeenCalledWith('wallet:connect', {
      wallet_address: WALLET.address,
      chain_id: 1,
      wallet_connector: 'test-wallet',
    })

    vi.mocked(posthog.opt_in_capturing).mockClear()
    callbacks.onDisconnect?.()
    expect(posthog.capture).toHaveBeenCalledWith('wallet:disconnect', undefined)
    expect(posthog.reset).toHaveBeenCalled()
    expect(posthog.opt_in_capturing).toHaveBeenCalledWith({
      captureEventName: false,
    })
    expect(posthog.get_explicit_consent_status()).toBe('granted')
  })

  it('sends no wallet address to PostHog without consent', () => {
    renderProvider()
    connectWallet()

    expect(posthog.identify).not.toHaveBeenCalled()
    expect(posthog.register).not.toHaveBeenCalled()
  })

  it('identifies a connected wallet on Accept and forgets it on Decline', () => {
    renderProvider()
    connectWallet()

    act(() => setAnalyticsConsent(posthog, true))
    expect(posthog.identify).toHaveBeenCalledWith(
      WALLET.address,
      { address: WALLET.address },
      { initial_address: WALLET.address },
    )

    act(() => setAnalyticsConsent(posthog, false))
    expect(posthog.reset).toHaveBeenCalled()
    expect(posthog.get_explicit_consent_status()).toBe('denied')
  })

  it('forgets the wallet when another tab or app declines', () => {
    setAnalyticsConsent(posthog, true)
    renderProvider()
    connectWallet()
    vi.mocked(posthog.get_property).mockReturnValueOnce('identified')

    // The shared cookie changes under this tab, which notices on focus.
    consent.stored = 'denied'
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(posthog.reset).toHaveBeenCalled()
    expect(posthog.get_explicit_consent_status()).toBe('denied')
  })

  it('applies the banner answer without a reload', () => {
    renderProvider()

    act(() => setAnalyticsConsent(posthog, true))
    expect(posthog.set_config).toHaveBeenLastCalledWith(
      expect.objectContaining({ disable_surveys: false }),
    )

    act(() => setAnalyticsConsent(posthog, false))
    expect(posthog.set_config).toHaveBeenLastCalledWith({
      disable_session_recording: true,
      disable_surveys: true,
    })
  })

  it('boots Intercom even when PostHog initialization fails', () => {
    vi.mocked(posthog.init).mockImplementationOnce(() => {
      throw new Error('blocked')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    renderProvider()
    expect(boot).toHaveBeenCalledWith({ app_id: INTERCOM_APP_ID })
  })
})
