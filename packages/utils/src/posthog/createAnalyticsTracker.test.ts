import { describe, expect, it, vi } from 'vitest'
import {
  invalidateAnalyticsOperations,
  notifyAnalyticsConsent,
} from './analyticsConsent'
import { createAnalyticsTracker } from './createAnalyticsTracker'

const setup = () => {
  let consent: 'pending' | 'granted' | 'denied' = 'pending'
  let identity = 'anonymous'
  let walletAddress: string | null | undefined = null
  const capture = vi.fn()
  const tracker = createAnalyticsTracker({
    getConnectedWalletAddress: () => walletAddress,
    client: {
      __loaded: true,
      get_explicit_consent_status: () => consent,
      get_distinct_id: () => identity,
      capture,
    },
  })
  return {
    ...tracker,
    capture,
    setWallet: (address: string | null | undefined) => {
      walletAddress = address
    },
    identify: (address: string) => {
      identity = address
    },
    grant: () => {
      consent = 'granted'
    },
    deny: () => {
      consent = 'denied'
      notifyAnalyticsConsent()
    },
    switch: () => {
      identity = 'wallet-b'
    },
  }
}

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
  it.each(['switch', 'regrant'] as const)(
    'suppresses old asynchronous outcomes after %s',
    (change) => {
      const tracker = setup()
      tracker.grant()
      const operation = tracker.startAnalyticsOperation()
      if (change === 'switch') tracker.switch()
      else {
        tracker.deny()
        tracker.grant()
      }
      operation.capture('registration:flow_complete', {
        flow_id: 'flow',
      })
      expect(tracker.capture).not.toHaveBeenCalled()
    },
  )
  it('forwards bounded domain diagnostics without treating dots as private names', () => {
    const tracker = setup()
    tracker.grant()
    tracker.track('transaction:execution_end', {
      operation_id: 'run',
      outcome: 'failure',
      failure_stage: 'execution.approval',
      attempt_count: 1,
    })
    expect(tracker.capture).toHaveBeenCalledWith('transaction:execution_end', {
      operation_id: 'run',
      outcome: 'failure',
      failure_stage: 'execution.approval',
      attempt_count: 1,
    })
  })
  it('does not break product operations when the SDK throws', () => {
    const tracker = setup()
    tracker.grant()
    tracker.capture.mockImplementation(() => {
      throw new Error('offline')
    })
    expect(() =>
      tracker.track('profile:primary_name_update', { chain_id: 1 }),
    ).not.toThrow()
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
