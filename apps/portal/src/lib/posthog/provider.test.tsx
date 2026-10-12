// @vitest-environment happy-dom
import {
  CONSENT_STORAGE_KEY,
  setStoredConsent,
} from '@ens-apps/analytics-consent/consent'
import { boot, trackEvent } from '@intercom/messenger-js-sdk'
import { act, render } from '@testing-library/react'
import posthog from 'posthog-js/dist/module.full.no-external'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnection, useConnectionEffect } from 'wagmi'
import { INTERCOM_APP_ID } from '@/lib/intercom'
import { PHProvider } from './provider'

vi.mock('@intercom/messenger-js-sdk', () => ({
  boot: vi.fn(),
  trackEvent: vi.fn(),
}))
vi.mock('@posthog/react', () => ({
  PostHogProvider: ({ children }: { children: unknown }) => children,
}))
vi.mock('posthog-js/dist/module.full.no-external', () => ({
  default: {
    init: vi.fn(),
    identify: vi.fn(),
    register: vi.fn(),
    capture: vi.fn(),
    reset: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
  },
}))
vi.mock('wagmi', () => ({
  useConnectionEffect: vi.fn(),
  useConnection: vi.fn(),
}))

const WALLET = '0x1111111111111111111111111111111111111111'

const mockDisconnected = () => {
  vi.mocked(useConnection).mockReturnValue({
    status: 'disconnected',
  } as never)
}

const mockConnected = () => {
  vi.mocked(useConnection).mockReturnValue({
    status: 'connected',
    address: WALLET,
    chainId: 1,
    connector: { name: 'test-wallet' },
  } as never)
}

const fireConnect = () => {
  const callbacks = vi.mocked(useConnectionEffect).mock.calls[0]?.[0]
  const wallet = {
    address: WALLET,
    chainId: 1,
    connector: { name: 'test-wallet' },
  }
  callbacks?.onConnect?.(
    wallet as Parameters<NonNullable<typeof callbacks.onConnect>>[0],
  )
}

const fireDisconnect = () => {
  const callbacks = vi.mocked(useConnectionEffect).mock.calls[0]?.[0]
  callbacks?.onDisconnect?.()
}

const posthogKeys = () =>
  Object.keys(localStorage).filter(
    (key) => key.startsWith('ph_') || key.startsWith('__ph_'),
  )

describe('consent PostHog provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockDisconnected()
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'test-key')
    vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', 'https://posthog.example')
    delete (window as { posthog?: unknown }).posthog
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('initializes anonymously with no stored choice and sweeps stale storage', () => {
    localStorage.setItem(
      'ph_test-key_posthog',
      JSON.stringify({ distinct_id: WALLET }),
    )
    localStorage.setItem('__ph_opt_in_out_test-key', '1')
    render(
      <PHProvider>
        <div>child</div>
      </PHProvider>,
    )
    expect(posthog.init).toHaveBeenCalledWith(
      'test-key',
      expect.objectContaining({
        api_host: 'https://posthog.example',
        opt_out_capturing_by_default: true,
        opt_out_persistence_by_default: true,
        autocapture: false,
        disable_session_recording: true,
        disable_surveys: true,
      }),
    )
    expect(posthogKeys()).toEqual([])
    expect(
      (window as { posthog?: unknown }).posthog,
      'window.posthog exposed',
    ).toBeDefined()
    expect(boot).toHaveBeenCalledWith({ app_id: INTERCOM_APP_ID })
    expect(posthog.capture).not.toHaveBeenCalled()
    expect(posthog.identify).not.toHaveBeenCalled()
  })

  it('skips PostHog without a key but still boots Intercom', () => {
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', '')
    render(
      <PHProvider>
        <div>child</div>
      </PHProvider>,
    )
    expect(posthog.init).not.toHaveBeenCalled()
    expect(boot).toHaveBeenCalledWith({ app_id: INTERCOM_APP_ID })
    act(() => {
      setStoredConsent('accepted')
    })
    expect(posthog.opt_in_capturing).not.toHaveBeenCalled()
    expect(posthog.identify).not.toHaveBeenCalled()
  })

  it('initializes capturing when the visitor accepted', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted')
    localStorage.setItem('ph_test-key_posthog', JSON.stringify({}))
    mockConnected()
    render(
      <PHProvider>
        <div>child</div>
      </PHProvider>,
    )
    const initConfig = vi.mocked(posthog.init).mock.calls[0]?.[1]
    expect(initConfig).toHaveProperty('opt_out_capturing_by_default', true)
    expect(initConfig).toHaveProperty('opt_out_persistence_by_default', true)
    expect(posthog.opt_in_capturing).toHaveBeenCalled()
    expect(posthogKeys()).toEqual(['ph_test-key_posthog'])
    expect(posthog.identify).toHaveBeenCalledWith(
      WALLET,
      { address: WALLET },
      { initial_address: WALLET },
    )
    expect(posthog.register).toHaveBeenCalledWith({
      wallet_address: WALLET,
      chain_id: 1,
      wallet_connector: 'test-wallet',
    })
  })

  it('accepting after init opts in and identifies the connected wallet', () => {
    mockConnected()
    render(
      <PHProvider>
        <div>child</div>
      </PHProvider>,
    )
    act(() => {
      setStoredConsent('accepted')
    })
    expect(posthog.opt_in_capturing).toHaveBeenCalledTimes(1)
    expect(posthog.identify).toHaveBeenCalledTimes(1)
    expect(posthog.register).toHaveBeenCalledTimes(1)
  })

  it('declining after init stops capture and sweeps storage', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted')
    render(
      <PHProvider>
        <div>child</div>
      </PHProvider>,
    )
    localStorage.setItem('ph_test-key_posthog', JSON.stringify({}))
    act(() => {
      setStoredConsent('declined')
    })
    expect(posthog.reset).toHaveBeenCalledTimes(1)
    expect(posthog.opt_out_capturing).toHaveBeenCalledTimes(1)
    expect(posthogKeys()).toEqual([])
  })

  it('tracks wallet connects only while accepted, Intercom always', () => {
    render(
      <PHProvider>
        <div>child</div>
      </PHProvider>,
    )
    fireConnect()
    expect(posthog.capture).not.toHaveBeenCalled()
    expect(posthog.identify).not.toHaveBeenCalled()
    expect(trackEvent).toHaveBeenCalledWith('wallet:connect', {
      wallet_address: WALLET,
      chain_id: 1,
      wallet_connector: 'test-wallet',
    })

    act(() => {
      setStoredConsent('accepted')
    })
    fireConnect()
    expect(posthog.capture).toHaveBeenCalledWith('wallet:connect', {
      wallet_address: WALLET,
      chain_id: 1,
      wallet_connector: 'test-wallet',
    })
  })

  it('tracks disconnects before resetting, only while accepted', () => {
    render(
      <PHProvider>
        <div>child</div>
      </PHProvider>,
    )
    fireDisconnect()
    expect(posthog.capture).not.toHaveBeenCalled()
    expect(posthog.reset).toHaveBeenCalledTimes(1)

    act(() => {
      setStoredConsent('accepted')
    })
    fireDisconnect()
    expect(posthog.capture).toHaveBeenCalledWith('wallet:disconnect', undefined)
    expect(posthog.reset).toHaveBeenCalledTimes(2)
  })

  it('boots Intercom even when PostHog initialization fails', () => {
    vi.mocked(posthog.init).mockImplementationOnce(() => {
      throw new Error('blocked')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    render(
      <PHProvider>
        <div>child</div>
      </PHProvider>,
    )
    expect(boot).toHaveBeenCalledWith({ app_id: INTERCOM_APP_ID })
  })
})
