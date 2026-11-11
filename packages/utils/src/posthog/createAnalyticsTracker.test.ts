import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidateAnalyticsOperations } from './analyticsConsent'
import { createAnalyticsTracker } from './createAnalyticsTracker'

const setup = (captureOverride?: () => unknown) => {
  let consent: 'pending' | 'granted' | 'denied' = 'pending'
  let identity = 'anonymous'
  let walletAddress: string | null | undefined = null
  const capture = vi.fn()
  const exceptionCapture = vi.fn()
  const tracker = createAnalyticsTracker({
    getConnectedWalletAddress: () => walletAddress,
    client: {
      __loaded: true,
      get_explicit_consent_status: () => consent,
      get_distinct_id: () => identity,
      capture: captureOverride ?? capture,
      captureException: exceptionCapture,
    },
  })
  return {
    ...tracker,
    capture,
    exceptionCapture,
    setWallet: (address: string | null | undefined) => {
      walletAddress = address
    },
    identify: (address: string) => {
      identity = address
    },
    grant: () => {
      consent = 'granted'
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('document', {
    cookie: 'ens_analytics_consent_generation=test-choice',
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('analytics transport', () => {
  it('never captures or replays actions from before consent', () => {
    const tracker = setup()
    const operation = tracker.startAnalyticsOperation()
    tracker.track('profile:primary_name_update', { chain_id: 1 })
    tracker.grant()
    operation.capture('profile:primary_name_update', { chain_id: 1 })
    expect(tracker.capture).not.toHaveBeenCalled()
    tracker.track('profile:primary_name_update', { chain_id: 1 })
    expect(tracker.capture).toHaveBeenCalledWith(
      'profile:primary_name_update',
      { chain_id: 1 },
    )
  })
  it('suppresses an old outcome after anonymous identity changes', () => {
    const tracker = setup()
    tracker.grant()
    const operation = tracker.startAnalyticsOperation()
    tracker.identify('next-anonymous')
    operation.capture('registration:flow_complete', { flow_id: 'flow' })
    expect(tracker.capture).not.toHaveBeenCalled()
  })
  it.each(['throw', 'reject'] as const)(
    'contains SDK capture %s failures',
    async (failure) => {
      const attempted = vi.fn()
      const tracker = setup(() => {
        attempted()
        if (failure === 'throw') throw new Error('offline')
        return Promise.reject(new Error('offline'))
      })
      tracker.grant()
      expect(() =>
        tracker.track('profile:primary_name_update', { chain_id: 1 }),
      ).not.toThrow()
      expect(attempted).toHaveBeenCalledOnce()
      await new Promise((resolve) => setTimeout(resolve, 0))
    },
  )
  it('suppresses delayed outcomes when consent metadata becomes unreadable without blocking current actions', () => {
    const tracker = setup()
    tracker.grant()
    const operation = tracker.startAnalyticsOperation()
    vi.stubGlobal('document', {
      get cookie() {
        throw new Error('Cookie access unavailable')
      },
    })

    operation.capture('profile:records_update', { chain_id: 1 })
    tracker.track('profile:primary_name_update', { chain_id: 1 })
    expect(tracker.capture).toHaveBeenCalledExactlyOnceWith(
      'profile:primary_name_update',
      { chain_id: 1 },
    )
  })
})

describe('synchronous wallet boundary', () => {
  const WALLET_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const WALLET_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

  it('blocks A outcomes and B actions before the provider updates SDK identity', () => {
    const tracker = setup()
    tracker.grant()
    tracker.setWallet(WALLET_A)
    tracker.identify(WALLET_A)
    const operation = tracker.startAnalyticsOperation()
    tracker.setWallet(WALLET_B)
    operation.capture('profile:records_update', { chain_id: 1 })
    tracker.track('profile:records_update', { chain_id: 1 })
    expect(tracker.capture).not.toHaveBeenCalled()
    tracker.identify(WALLET_B)
    tracker.track('profile:records_update', { chain_id: 1 })
    expect(tracker.capture).toHaveBeenCalledTimes(1)
  })
  it.each([null, undefined])(
    'blocks stale wallet identity after disconnect or during reconnect (%s)',
    (wallet) => {
      const tracker = setup()
      tracker.grant()
      tracker.setWallet(WALLET_A)
      tracker.identify(WALLET_A)
      const operation = tracker.startAnalyticsOperation()
      tracker.setWallet(wallet)
      operation.capture('profile:records_update', { chain_id: 1 })
      tracker.track('profile:records_update', { chain_id: 1 })
      expect(tracker.capture).not.toHaveBeenCalled()
    },
  )
  it('keeps a pending operation when only wallet address casing changes', () => {
    const tracker = setup()
    tracker.grant()
    tracker.setWallet(WALLET_A.toUpperCase().replace('0X', '0x'))
    tracker.identify(WALLET_A)
    const operation = tracker.startAnalyticsOperation()
    tracker.setWallet(WALLET_A)
    operation.capture('profile:records_update', { chain_id: 1 })
    expect(tracker.capture).toHaveBeenCalledExactlyOnceWith(
      'profile:records_update',
      { chain_id: 1 },
    )
  })
  it('invalidates an old operation even when switching back returns the same wallet ID', () => {
    const tracker = setup()
    tracker.grant()
    tracker.setWallet(WALLET_A)
    tracker.identify(WALLET_A)
    const operation = tracker.startAnalyticsOperation()
    invalidateAnalyticsOperations()
    operation.capture('profile:records_update', { chain_id: 1 })
    expect(tracker.capture).not.toHaveBeenCalled()
  })
})

it('attributes explicit disconnect to the departing wallet while suppressing other stale actions', () => {
  const tracker = setup()
  tracker.grant()
  tracker.setWallet(null)
  tracker.identify('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  tracker.track('wallet:disconnect')
  tracker.track('profile:records_update', { chain_id: 1 })
  expect(tracker.capture).toHaveBeenCalledExactlyOnceWith(
    'wallet:disconnect',
    undefined,
  )
})

it('captures caught exceptions once across React/router callbacks, only with matching consent and identity', () => {
  const state = setup()
  const error = new Error('render failed')
  state.captureException(error)
  expect(state.exceptionCapture).not.toHaveBeenCalled()
  state.grant()
  state.setWallet('0x1111111111111111111111111111111111111111')
  state.captureException(error)
  expect(state.exceptionCapture).not.toHaveBeenCalled()
  state.identify('0x1111111111111111111111111111111111111111')
  state.captureException(error)
  state.captureException(error)
  expect(state.exceptionCapture).toHaveBeenCalledExactlyOnceWith(error)
  state.exceptionCapture.mockImplementation(() => {
    throw new Error('SDK unavailable')
  })
  expect(() => state.captureException(new Error('another crash'))).not.toThrow()
})
