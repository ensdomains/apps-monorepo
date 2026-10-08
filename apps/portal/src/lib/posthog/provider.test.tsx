import { boot, trackEvent } from '@intercom/messenger-js-sdk'
import { render } from '@testing-library/react'
import posthog from 'posthog-js/dist/module.full.no-external'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnectionEffect } from 'wagmi'
import { INTERCOM_APP_ID } from '@/lib/intercom'
import { FEATURE_FLAGS_ONLY_CONFIG } from './config'
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
  },
}))
vi.mock('wagmi', () => ({ useConnectionEffect: vi.fn() }))
vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: {
    onFailedRunTelemetry: vi.fn(() => vi.fn()),
    onRunTelemetryEvent: vi.fn(() => vi.fn()),
  },
}))

describe('launch PostHog provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'test-key')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('initializes flags with collection disabled and boots Intercom without analytics metadata', () => {
    render(
      <PHProvider>
        <div>child</div>
      </PHProvider>,
    )
    expect(posthog.init).toHaveBeenCalledWith(
      'test-key',
      expect.objectContaining(FEATURE_FLAGS_ONLY_CONFIG),
    )
    expect(boot).toHaveBeenCalledWith({ app_id: INTERCOM_APP_ID })
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it('keeps wallet targeting and Intercom operational without analytics properties', () => {
    render(
      <PHProvider>
        <div>child</div>
      </PHProvider>,
    )
    const wallet = {
      address: '0x1111111111111111111111111111111111111111',
      chainId: 1,
      connector: { name: 'test-wallet' },
    }
    const callbacks = vi.mocked(useConnectionEffect).mock.calls[0]?.[0]
    callbacks?.onConnect?.(
      wallet as Parameters<NonNullable<typeof callbacks.onConnect>>[0],
    )
    expect(posthog.identify).toHaveBeenCalledWith(
      wallet.address,
      { address: wallet.address },
      { initial_address: wallet.address },
    )
    expect(posthog.register).not.toHaveBeenCalled()
    expect(posthog.capture).not.toHaveBeenCalled()
    expect(trackEvent).toHaveBeenCalledWith('wallet:connect', {
      wallet_address: wallet.address,
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
    expect(boot).toHaveBeenCalledWith({ app_id: INTERCOM_APP_ID })
  })
})
