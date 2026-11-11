import { transactionManager } from '@ens-apps/transaction-manager'
import {
  boot,
  getVisitorId,
  trackEvent,
  update,
} from '@intercom/messenger-js-sdk'
import { act, render } from '@testing-library/react'
import posthog from 'posthog-js/dist/module.full.no-external'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnection, useConnectionEffect } from 'wagmi'

let POSTHOG_CONFIG: typeof import('./config').POSTHOG_CONFIG
let setAnalyticsConsent: typeof import('./config').setAnalyticsConsent
let PHProvider: typeof import('./provider').PHProvider

const loadProvider = async () => {
  vi.resetModules()
  ;({ POSTHOG_CONFIG, setAnalyticsConsent } = await import('./config'))
  ;({ PHProvider } = await import('./provider'))
}

vi.mock('@tanstack/react-router', () => ({ useHydrated: () => true }))
vi.mock('@intercom/messenger-js-sdk', () => ({
  boot: vi.fn(),
  getVisitorId: vi.fn(),
  trackEvent: vi.fn(),
  update: vi.fn(),
}))
// The answer PostHog keeps in its cookie.
const consent = vi.hoisted(() => ({ stored: 'pending' }))
const walletState = vi.hoisted(() => ({
  identity: 'distinct-id',
  address: undefined as string | undefined,
  status: 'disconnected',
}))
vi.mock('@/lib/wagmi', () => ({ wagmiConfig: {} }))
vi.mock('@wagmi/core/actions', () => ({
  getConnection: () => ({
    address: walletState.address,
    status: walletState.status,
  }),
}))
vi.mock('posthog-js/dist/module.full.no-external', () => ({
  default: {
    __loaded: true,
    init: vi.fn(),
    identify: vi.fn((address: string) => {
      walletState.identity = address
    }),
    register: vi.fn(),
    setPersonProperties: vi.fn(),
    capture: vi.fn(),
    reset: vi.fn(() => {
      consent.stored = 'pending'
      walletState.identity = 'distinct-id'
    }),
    get_distinct_id: vi.fn(() => walletState.identity),
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
    setPersonPropertiesForFlags: vi.fn(),
  },
}))
vi.mock('wagmi', () => ({
  useConnectionEffect: vi.fn(),
  useConnection: vi.fn(() => ({ status: 'disconnected' })),
}))
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
  walletState.address = WALLET.address
  walletState.status = 'connected'
  const callbacks = vi.mocked(useConnectionEffect).mock.calls[0]?.[0]
  if (!callbacks) throw new Error('Missing connection callbacks')
  callbacks.onConnect?.(
    WALLET as Parameters<NonNullable<typeof callbacks.onConnect>>[0],
  )
}

describe('PostHog provider', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    consent.stored = 'pending'
    walletState.identity = 'distinct-id'
    walletState.address = undefined
    walletState.status = 'disconnected'
    vi.mocked(useConnection).mockReturnValue({
      status: 'disconnected',
    } as ReturnType<typeof useConnection>)
    vi.mocked(posthog.get_property).mockReturnValue(undefined)
    vi.mocked(posthog.get_distinct_id).mockImplementation(
      () => walletState.identity,
    )
    vi.stubEnv('VITE_ENS_NETWORK', 'sepolia')
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'staging-test-key')
    vi.stubEnv('VITE_PUBLIC_POSTHOG_DEBUG', 'true')
    await loadProvider()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('renders children when reading SDK consent throws', () => {
    vi.spyOn(posthog, 'get_explicit_consent_status').mockImplementation(() => {
      throw new Error('SDK unavailable')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(renderProvider().getByText('child').textContent).toBe('child')
  })

  it('initializes PostHog with the consent-gated config', () => {
    renderProvider()
    expect(posthog.init).toHaveBeenCalledWith(
      'staging-test-key',
      expect.objectContaining(POSTHOG_CONFIG),
    )
  })

  it('links Intercom to analytics only with consent, including after Accept', () => {
    vi.mocked(getVisitorId).mockReturnValue('intercom-visitor')
    renderProvider()
    expect(posthog.setPersonProperties).not.toHaveBeenCalled()
    expect(boot).toHaveBeenCalledWith({ app_id: INTERCOM_APP_ID })
    expect(update).not.toHaveBeenCalled()

    act(() => setAnalyticsConsent(posthog, true))
    expect(update).toHaveBeenCalledWith({
      posthog_distinct_id: 'distinct-id',
    })
    expect(posthog.setPersonProperties).toHaveBeenCalledWith({
      intercom_visitor_id: 'intercom-visitor',
    })
  })

  it('resets the previous wallet before identifying a direct account switch', () => {
    vi.mocked(getVisitorId).mockReturnValue('intercom-visitor')
    setAnalyticsConsent(posthog, true)
    const view = renderProvider()
    vi.mocked(posthog.get_property).mockReturnValue('identified')
    walletState.identity = WALLET.address
    const nextAddress = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    vi.mocked(useConnection, { partial: true }).mockReturnValue({
      chainId: WALLET.chainId,
      connector: WALLET.connector as NonNullable<
        ReturnType<typeof useConnection>['connector']
      >,
      address: nextAddress,
      status: 'connected',
    })
    vi.mocked(update).mockClear()
    vi.mocked(posthog.setPersonProperties).mockClear()
    vi.mocked(posthog.reset).mockClear()
    vi.mocked(posthog.identify).mockClear()
    view.rerender(
      <PHProvider>
        <div>child</div>
      </PHProvider>,
    )
    expect(posthog.reset).toHaveBeenCalledOnce()
    expect(posthog.identify).toHaveBeenCalledWith(nextAddress.toLowerCase())
    expect(update).toHaveBeenLastCalledWith({
      posthog_distinct_id: nextAddress.toLowerCase(),
    })
    expect(posthog.setPersonProperties).toHaveBeenCalledWith({
      intercom_visitor_id: 'intercom-visitor',
    })
    expect(vi.mocked(posthog.reset).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(posthog.identify).mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('sends nothing about the wallet without consent', () => {
    renderProvider()
    connectWallet()

    expect(posthog.setPersonPropertiesForFlags).not.toHaveBeenCalled()
    expect(posthog.identify).not.toHaveBeenCalled()
    expect(posthog.register).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('identifies and tracks wallet connects with consent', () => {
    setAnalyticsConsent(posthog, true)
    renderProvider()
    connectWallet()

    expect(posthog.identify).toHaveBeenCalledWith(WALLET.address)
    expect(posthog.capture).toHaveBeenCalledWith('wallet:connect', {
      chain_id: 1,
      wallet_connector: 'test-wallet',
    })
    expect(trackEvent).toHaveBeenCalledWith('wallet:connect', {
      wallet_address: WALLET.address,
      chain_id: 1,
      wallet_connector: 'test-wallet',
    })
  })

  it('identifies a connected wallet on Accept and forgets it on Decline', () => {
    renderProvider()
    connectWallet()

    act(() => setAnalyticsConsent(posthog, true))
    expect(posthog.identify).toHaveBeenCalledWith(WALLET.address)

    act(() => setAnalyticsConsent(posthog, false))
    expect(posthog.reset).toHaveBeenCalled()
    expect(posthog.setPersonPropertiesForFlags).not.toHaveBeenCalled()
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
    expect(posthog.setPersonPropertiesForFlags).not.toHaveBeenCalled()
  })

  it('applies the banner answer without a reload, until unmounted', () => {
    const { unmount } = renderProvider()

    act(() => setAnalyticsConsent(posthog, true))
    expect(posthog.set_config).toHaveBeenLastCalledWith(
      expect.objectContaining({ disable_surveys: false }),
    )
    act(() => setAnalyticsConsent(posthog, false))
    expect(posthog.set_config).toHaveBeenLastCalledWith({
      disable_session_recording: true,
      disable_surveys: true,
    })

    unmount()
    vi.mocked(posthog.set_config).mockClear()
    setAnalyticsConsent(posthog, true)
    expect(posthog.set_config).not.toHaveBeenCalled()
  })

  it('boots Intercom even when PostHog initialization fails', () => {
    vi.mocked(posthog.init).mockImplementationOnce(() => {
      throw new Error('blocked')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    renderProvider()
    expect(boot).toHaveBeenCalledWith({ app_id: INTERCOM_APP_ID })
  })

  it('logs failed runs locally and sends only bounded initiating-identity diagnostics', () => {
    setAnalyticsConsent(posthog, true)
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
    expect(transactionManager.onRunTelemetryEvent).toHaveBeenCalledTimes(2)
    if (!listener) throw new Error('Missing failure telemetry listener')
    const runListener = vi.mocked(transactionManager.onRunTelemetryEvent).mock
      .calls[0]?.[0]
    if (!runListener) throw new Error('Missing run identity listener')
    runListener({
      runId: 'run',
      txId: 'tx',
      event: { sequence: 1 },
    } as Parameters<typeof runListener>[0])
    listener({
      run: { txId: 'tx', runId: 'run', status: 'error' },
      summary: { failureStage: 'submission', attemptCount: 1 },
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
    expect(posthog.capture).toHaveBeenCalledWith('transaction:execution_end', {
      operation_id: 'run',
      outcome: 'failure',
      failure_stage: 'submission',
      attempt_count: 1,
    })
    expect(unsubscribeFailed).not.toHaveBeenCalled()
    expect(unsubscribeLive).not.toHaveBeenCalled()
    unmount()
    expect(unsubscribeFailed).toHaveBeenCalledTimes(1)
    expect(unsubscribeLive).toHaveBeenCalledTimes(1)
  })
})
