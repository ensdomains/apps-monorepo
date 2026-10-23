import { storeAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConsent'
import { boot, trackEvent } from '@intercom/messenger-js-sdk'
import { render } from '@testing-library/react'
import posthog from 'posthog-js/dist/module.full.no-external'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnectionEffect } from 'wagmi'
import { INTERCOM_APP_ID } from '@/lib/intercom'
import { POSTHOG_CONFIG } from './config'
import { PHProvider } from './provider'

vi.mock('@intercom/messenger-js-sdk', () => ({
  boot: vi.fn(),
  getVisitorId: vi.fn(),
  trackEvent: vi.fn(),
}))
vi.mock('@posthog/react', () => ({
  PostHogProvider: ({ children }: { children: unknown }) => children,
}))
vi.mock('posthog-js/dist/module.full.no-external', () => ({
  default: {
    __loaded: true,
    init: vi.fn(),
    identify: vi.fn(),
    register: vi.fn(),
    capture: vi.fn(),
    reset: vi.fn(),
    get_distinct_id: vi.fn(() => 'distinct-id'),
    get_session_replay_url: vi.fn(() => 'replay-url'),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
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
    localStorage.clear()
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

  it('links Intercom to analytics only after consent', () => {
    const { unmount } = renderProvider()
    expect(boot).toHaveBeenLastCalledWith({ app_id: INTERCOM_APP_ID })
    unmount()

    storeAnalyticsConsent('granted')
    renderProvider()
    expect(boot).toHaveBeenLastCalledWith({
      app_id: INTERCOM_APP_ID,
      posthog_distinct_id: 'distinct-id',
      recent_replay: 'replay-url',
    })
  })

  it('tracks wallet connects and keeps consent after the disconnect reset', () => {
    storeAnalyticsConsent('granted')
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

    storeAnalyticsConsent('granted')
    expect(posthog.identify).toHaveBeenCalledWith(
      WALLET.address,
      { address: WALLET.address },
      { initial_address: WALLET.address },
    )

    storeAnalyticsConsent('denied')
    expect(posthog.reset).toHaveBeenCalled()
  })

  it('applies the banner answer without a reload', () => {
    renderProvider()

    storeAnalyticsConsent('granted')
    expect(posthog.opt_in_capturing).toHaveBeenCalled()

    storeAnalyticsConsent('denied')
    expect(posthog.opt_out_capturing).toHaveBeenCalled()
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
