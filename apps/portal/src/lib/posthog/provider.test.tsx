import {
  boot,
  getVisitorId,
  trackEvent,
  update,
} from '@intercom/messenger-js-sdk'
import { act, render } from '@testing-library/react'
import { createConfig, http } from '@wagmi/core'
import posthog from 'posthog-js/dist/module.full.no-external'
import { getAddress } from 'viem'
import { mainnet } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnection, useConnectionEffect } from 'wagmi'
import { mock } from 'wagmi/connectors'

let POSTHOG_CONFIG: typeof import('./config').POSTHOG_CONFIG
let setAnalyticsConsent: typeof import('./config').setAnalyticsConsent
let PHProvider: typeof import('./provider').PHProvider

const loadProvider = async () => {
  vi.resetModules()
  ;({ POSTHOG_CONFIG, setAnalyticsConsent } = await import('./config'))
  ;({ PHProvider } = await import('./provider'))
}

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
  address: undefined as `0x${string}` | undefined,
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
  },
}))
vi.mock('wagmi', () => ({
  useConnectionEffect: vi.fn(),
  useConnection: vi.fn(() => ({ status: 'disconnected' })),
}))

const [connector] = createConfig({
  chains: [mainnet],
  connectors: [
    mock({ accounts: ['0x1111111111111111111111111111111111111111'] }),
  ],
  transports: { [mainnet.id]: http() },
}).connectors
if (!connector) throw new Error('Missing test connector')

const WALLET = {
  address: '0x1111111111111111111111111111111111111111',
  addresses: ['0x1111111111111111111111111111111111111111'],
  chain: undefined,
  chainId: 1,
  connector,
  isReconnected: false,
} as const

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
  walletState.address = WALLET.address
  walletState.status = 'connected'
  const callbacks = connectionCallbacks()
  callbacks.onConnect?.(WALLET)
  return callbacks
}

describe('PostHog provider', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    consent.stored = 'pending'
    walletState.identity = 'distinct-id'
    walletState.address = undefined
    walletState.status = 'disconnected'
    vi.mocked(useConnection, { partial: true }).mockImplementation(() =>
      walletState.status === 'connected'
        ? { status: 'connected', address: walletState.address }
        : { status: 'disconnected' },
    )
    vi.mocked(posthog.get_property).mockReturnValue(undefined)
    vi.mocked(posthog.get_distinct_id).mockImplementation(
      () => walletState.identity,
    )
    vi.stubEnv('VITE_ENS_NETWORK', 'sepolia')
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'staging-test-key')
    vi.stubEnv('VITE_PUBLIC_POSTHOG_DEBUG', 'true')
    vi.stubEnv('VITE_INTERCOM_APP_ID', 'test-app')
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

  it('links the current person when the Intercom visitor becomes available after initial consent', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(getVisitorId).mockReturnValue(undefined)
      setAnalyticsConsent(posthog, true)
      const view = renderProvider()
      expect(posthog.setPersonProperties).not.toHaveBeenCalled()
      vi.mocked(getVisitorId).mockReturnValue('late-visitor')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      expect(posthog.setPersonProperties).toHaveBeenCalledExactlyOnceWith({
        intercom_visitor_id: 'late-visitor',
      })
      view.unmount()
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('links Intercom to analytics only with consent, including after Accept', () => {
    vi.mocked(getVisitorId).mockReturnValue('intercom-visitor')
    renderProvider()
    expect(posthog.setPersonProperties).not.toHaveBeenCalled()
    expect(boot).toHaveBeenCalledWith({ app_id: 'test-app' })
    expect(update).not.toHaveBeenCalled()

    act(() => setAnalyticsConsent(posthog, true))
    expect(update).toHaveBeenCalledWith({
      posthog_distinct_id: 'distinct-id',
    })
    expect(posthog.setPersonProperties).toHaveBeenCalledWith({
      intercom_visitor_id: 'intercom-visitor',
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
      chain_id: 1,
      wallet_connector: connector.name,
    })
    expect(trackEvent).toHaveBeenCalledWith('wallet:connect', {
      wallet_address: WALLET.address,
      chain_id: 1,
      wallet_connector: connector.name,
    })

    vi.mocked(posthog.opt_in_capturing).mockClear()
    walletState.address = undefined
    walletState.status = 'disconnected'
    callbacks.onDisconnect?.()
    expect(posthog.capture).toHaveBeenCalledWith('wallet:disconnect', undefined)
    expect(posthog.reset).toHaveBeenCalled()
    expect(posthog.opt_in_capturing).toHaveBeenCalledWith({
      captureEventName: false,
    })
    expect(posthog.get_explicit_consent_status()).toBe('granted')
  })

  it('resets the previous wallet before identifying a direct account switch', () => {
    vi.mocked(getVisitorId).mockReturnValue('intercom-visitor')
    setAnalyticsConsent(posthog, true)
    const view = renderProvider()
    vi.mocked(posthog.get_property).mockReturnValue('identified')
    walletState.identity = WALLET.address
    const nextAddress = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    walletState.address = nextAddress
    walletState.status = 'connected'
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
    expect(posthog.identify).toHaveBeenCalledWith(
      getAddress(nextAddress),
      { address: getAddress(nextAddress) },
      { initial_address: getAddress(nextAddress) },
    )
    expect(update).toHaveBeenLastCalledWith({
      posthog_distinct_id: getAddress(nextAddress),
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

    expect(posthog.identify).not.toHaveBeenCalled()
    expect(posthog.register).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
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
    expect(boot).toHaveBeenCalledWith({ app_id: 'test-app' })
  })

  // The .eth mirror builds with neither.
  it('starts neither SDK without their keys', async () => {
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', '')
    vi.stubEnv('VITE_INTERCOM_APP_ID', '')
    await loadProvider()
    renderProvider()
    expect(posthog.init).not.toHaveBeenCalled()
    expect(boot).not.toHaveBeenCalled()
  })
})
