import { transactionManager } from '@ens-apps/transaction-manager'
import { storeAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConsent'
import { boot, trackEvent, update } from '@intercom/messenger-js-sdk'
import { render } from '@testing-library/react'
import posthog from 'posthog-js/dist/module.full.no-external'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnectionEffect } from 'wagmi'
import { POSTHOG_CONFIG } from './config'
import { PHProvider } from './provider'

vi.mock('@tanstack/react-router', () => ({ useHydrated: () => true }))
vi.mock('@intercom/messenger-js-sdk', () => ({
  boot: vi.fn(),
  getVisitorId: vi.fn(),
  trackEvent: vi.fn(),
  update: vi.fn(),
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
    setPersonPropertiesForFlags: vi.fn(),
  },
}))
vi.mock('wagmi', () => ({ useConnectionEffect: vi.fn() }))
vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: {
    onFailedRunTelemetry: vi.fn(() => vi.fn()),
    onRunTelemetryEvent: vi.fn(() => vi.fn()),
  },
}))

const INTERCOM_APP_ID = 're9q5yti'
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

const connectWallet = () => {
  const callbacks = vi.mocked(useConnectionEffect).mock.calls[0]?.[0]
  if (!callbacks) throw new Error('Missing connection callbacks')
  callbacks.onConnect?.(
    WALLET as Parameters<NonNullable<typeof callbacks.onConnect>>[0],
  )
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

  it('links Intercom to analytics only with consent, including after Accept', () => {
    renderProvider()
    expect(boot).toHaveBeenCalledWith({ app_id: INTERCOM_APP_ID })
    expect(update).not.toHaveBeenCalled()

    storeAnalyticsConsent('granted')
    expect(update).toHaveBeenCalledWith({
      posthog_distinct_id: 'distinct-id',
      recent_replay: 'replay-url',
    })
  })

  it('gives the wallet to flag rules only, without consent', () => {
    renderProvider()
    connectWallet()

    expect(posthog.setPersonPropertiesForFlags).toHaveBeenCalledWith({
      address: WALLET.address,
    })
    expect(posthog.identify).not.toHaveBeenCalled()
    expect(posthog.register).not.toHaveBeenCalled()
    expect(trackEvent).toHaveBeenCalledWith('wallet:connect', {
      wallet_address: WALLET.address,
      chain_id: 1,
      wallet_connector: 'test-wallet',
    })
  })

  it('identifies and tracks wallet connects with consent', () => {
    storeAnalyticsConsent('granted')
    renderProvider()
    connectWallet()

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

    vi.mocked(posthog.setPersonPropertiesForFlags).mockClear()
    storeAnalyticsConsent('denied')
    expect(posthog.reset).toHaveBeenCalled()
    expect(posthog.setPersonPropertiesForFlags).toHaveBeenCalledWith({
      address: WALLET.address,
    })
  })

  it('applies the banner answer without a reload, until unmounted', () => {
    const { unmount } = renderProvider()

    storeAnalyticsConsent('granted')
    expect(posthog.opt_in_capturing).toHaveBeenCalledTimes(1)
    storeAnalyticsConsent('denied')
    expect(posthog.opt_out_capturing).toHaveBeenCalledTimes(1)

    unmount()
    storeAnalyticsConsent('granted')
    expect(posthog.opt_in_capturing).toHaveBeenCalledTimes(1)
  })

  it('boots Intercom even when PostHog initialization fails', () => {
    vi.mocked(posthog.init).mockImplementationOnce(() => {
      throw new Error('blocked')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    renderProvider()
    expect(boot).toHaveBeenCalledWith({ app_id: INTERCOM_APP_ID })
  })

  it('logs failed runs locally and tracks them for PostHog', () => {
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

    const { unmount } = renderProvider()
    const listener = vi.mocked(transactionManager.onFailedRunTelemetry).mock
      .calls[0]?.[0]
    expect(transactionManager.onFailedRunTelemetry).toHaveBeenCalledTimes(1)
    expect(transactionManager.onRunTelemetryEvent).toHaveBeenCalledTimes(1)
    if (!listener) throw new Error('Missing failure telemetry listener')
    listener({
      run: { txId: 'tx', runId: 'run', status: 'error' },
      summary: { failureStage: 'submission' },
      truncation: { totalEvents: 3, truncated: false, droppedEvents: 0 },
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
    expect(posthog.capture).toHaveBeenCalledWith(
      'tm:failed_run',
      expect.objectContaining({
        tm_run_id: 'run',
        tm_tx_id: 'tx',
        tm_failure_stage: 'submission',
        tm_event_count: 3,
        source_app: 'manager',
      }),
    )
    expect(unsubscribeFailed).not.toHaveBeenCalled()
    expect(unsubscribeLive).not.toHaveBeenCalled()
    unmount()
    expect(unsubscribeFailed).toHaveBeenCalledTimes(1)
    expect(unsubscribeLive).toHaveBeenCalledTimes(1)
  })
})
