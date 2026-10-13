// @vitest-environment happy-dom
import {
  CONSENT_STORAGE_KEY,
  setStoredConsent,
} from '@ens-apps/analytics-consent/consent'
import {
  CONSENT_COOKIE_NAME,
  writeConsentCookie,
} from '@ens-apps/analytics-consent/cookie'
import { transactionManager } from '@ens-apps/transaction-manager'
import { boot, trackEvent } from '@intercom/messenger-js-sdk'
import { act, render } from '@testing-library/react'
import posthog from 'posthog-js/dist/module.full.no-external'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnection, useConnectionEffect } from 'wagmi'
import { PHProvider } from './provider'

vi.mock('@tanstack/react-router', () => ({ useHydrated: () => true }))
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
vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: {
    onFailedRunTelemetry: vi.fn(() => vi.fn()),
    onRunTelemetryEvent: vi.fn(() => vi.fn()),
  },
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

const connectCallbacks = () => vi.mocked(useConnectionEffect).mock.calls[0]?.[0]

const fireConnect = () => {
  const callbacks = connectCallbacks()
  const wallet = {
    address: WALLET,
    chainId: 1,
    connector: { name: 'test-wallet' },
  }
  callbacks?.onConnect?.(
    wallet as Parameters<NonNullable<typeof callbacks.onConnect>>[0],
  )
}

const clearCookies = async (): Promise<void> => {
  for (const cookie of await cookieStore.getAll()) {
    if (cookie.name) await cookieStore.delete(cookie.name)
  }
}

const posthogKeys = () =>
  Object.keys(localStorage).filter(
    (key) => key.startsWith('ph_') || key.startsWith('__ph_'),
  )

describe('consent PostHog provider', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    await clearCookies()
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
        capture_pageview: 'history_change',
        disable_session_recording: true,
        disable_surveys: true,
      }),
    )
    expect(posthogKeys()).toEqual([])
    expect(
      (window as { posthog?: unknown }).posthog,
      'window.posthog exposed for e2e',
    ).toBeDefined()
    expect(boot).toHaveBeenCalledWith({ app_id: 're9q5yti' })
    expect(document.cookie).not.toContain(CONSENT_COOKIE_NAME)
    expect(posthog.capture).not.toHaveBeenCalled()
    expect(posthog.identify).not.toHaveBeenCalled()
  })

  it('initializes capturing when the visitor accepted and mirrors the cookie', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted')
    localStorage.setItem('ph_test-key_posthog', JSON.stringify({}))
    mockConnected()
    render(
      <PHProvider>
        <div>child</div>
      </PHProvider>,
    )
    const initConfig = vi.mocked(posthog.init).mock.calls[0]?.[1]
    expect(initConfig).toMatchObject({ autocapture: false })
    expect(initConfig).toHaveProperty('opt_out_capturing_by_default', true)
    expect(initConfig).toHaveProperty('opt_out_persistence_by_default', true)
    expect(posthog.opt_in_capturing).toHaveBeenCalled()
    expect(posthogKeys()).toEqual(['ph_test-key_posthog'])
    expect(document.cookie).toContain(`${CONSENT_COOKIE_NAME}=accepted`)
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

  it('clears a stale consent cookie when no choice is stored', () => {
    writeConsentCookie('accepted')
    render(
      <PHProvider>
        <div>child</div>
      </PHProvider>,
    )
    expect(document.cookie).not.toContain(CONSENT_COOKIE_NAME)
  })

  it('a choice vanishing mid-session declines and clears the mirror', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted')
    render(
      <PHProvider>
        <div>child</div>
      </PHProvider>,
    )
    expect(document.cookie).toContain(`${CONSENT_COOKIE_NAME}=accepted`)
    act(() => {
      localStorage.removeItem(CONSENT_STORAGE_KEY)
      window.dispatchEvent(
        new StorageEvent('storage', { key: CONSENT_STORAGE_KEY }),
      )
    })
    expect(posthog.opt_out_capturing).toHaveBeenCalled()
    expect(document.cookie).not.toContain(CONSENT_COOKIE_NAME)
  })

  it('initializes anonymously when the visitor declined and mirrors the cookie', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'declined')
    mockConnected()
    render(
      <PHProvider>
        <div>child</div>
      </PHProvider>,
    )
    expect(posthog.init).toHaveBeenCalledWith(
      'test-key',
      expect.objectContaining({ opt_out_capturing_by_default: true }),
    )
    expect(document.cookie).toContain(`${CONSENT_COOKIE_NAME}=declined`)
    expect(posthog.identify).not.toHaveBeenCalled()
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it('accepting after init opts in and identifies the connected wallet', () => {
    mockConnected()
    render(
      <PHProvider>
        <div>child</div>
      </PHProvider>,
    )
    expect(posthog.identify).not.toHaveBeenCalled()
    act(() => {
      setStoredConsent('accepted')
    })
    expect(posthog.opt_in_capturing).toHaveBeenCalledTimes(1)
    expect(document.cookie).toContain(`${CONSENT_COOKIE_NAME}=accepted`)
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
    const resetOrder = vi.mocked(posthog.reset).mock.invocationCallOrder[0]
    const optOutOrder = vi.mocked(posthog.opt_out_capturing).mock
      .invocationCallOrder[0]
    expect(resetOrder).toBeLessThan(optOutOrder as number)
    expect(posthogKeys()).toEqual([])
    expect(document.cookie).toContain(`${CONSENT_COOKIE_NAME}=declined`)
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
    expect(boot).toHaveBeenCalledWith({ app_id: 're9q5yti' })
  })

  it('keeps failure diagnostics local without PostHog telemetry', () => {
    vi.stubEnv('DEV', true)
    const groupCollapsed = vi
      .spyOn(console, 'groupCollapsed')
      .mockImplementation(() => undefined)
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const groupEnd = vi
      .spyOn(console, 'groupEnd')
      .mockImplementation(() => undefined)
    const unsubscribeFailed = vi.fn()
    const unsubscribeLive = vi.fn()
    vi.mocked(transactionManager.onFailedRunTelemetry).mockReturnValueOnce(
      unsubscribeFailed,
    )
    vi.mocked(transactionManager.onRunTelemetryEvent).mockReturnValueOnce(
      unsubscribeLive,
    )

    const { unmount } = render(
      <PHProvider>
        <div>child</div>
      </PHProvider>,
    )
    const listener = vi.mocked(transactionManager.onFailedRunTelemetry).mock
      .calls[0]?.[0]
    expect(transactionManager.onFailedRunTelemetry).toHaveBeenCalledTimes(1)
    expect(transactionManager.onRunTelemetryEvent).toHaveBeenCalledTimes(1)
    expect(listener).toBeTypeOf('function')
    if (!listener) throw new Error('Missing failure telemetry listener')
    listener({
      run: { txId: 'tx', runId: 'run', status: 'error' },
      summary: { failureStage: 'submission' },
    } as Parameters<NonNullable<typeof listener>>[0])
    expect(groupCollapsed).toHaveBeenCalledWith(
      '[TM-RUN] failed tx status=error stage=submission',
    )
    expect(info).toHaveBeenCalledWith(
      'summary',
      expect.objectContaining({
        runId: 'run',
        txId: 'tx',
        status: 'error',
        failureStage: 'submission',
      }),
    )
    expect(groupEnd).toHaveBeenCalledTimes(1)
    expect(unsubscribeFailed).not.toHaveBeenCalled()
    expect(unsubscribeLive).not.toHaveBeenCalled()
    unmount()
    expect(unsubscribeFailed).toHaveBeenCalledTimes(1)
    expect(unsubscribeLive).toHaveBeenCalledTimes(1)
    expect(posthog.capture).not.toHaveBeenCalled()
  })
})
