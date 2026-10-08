import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResumeAssessment } from '../service/assessResumableRegistration'
import type { RegistrationV2UiActor } from './registrationUi.machine'
import {
  DISCONNECT_GRACE_MS,
  useRegistrationResume,
} from './useRegistrationResume'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const OTHER = '0x2222222222222222222222222222222222222222' as Address

const assessResumableRegistration = vi.fn()
const clearStoredRegistration = vi.fn()
const loadStoredRegistration = vi.fn()
const needsSessionBeforeRegistration = vi.fn(() => false)
const useSmartAccountContext = vi.fn()
const useConnection = vi.fn(() => ({ isDisconnected: false }))
const toast = vi.fn()

// Mocked wholesale rather than via `importOriginal`: the real module pulls in
// the pricing query and the wagmi client, none of which this hook's behaviour
// depends on. `isResumeOwner` is pure, so it is reproduced rather than stubbed.
vi.mock('../service/assessResumableRegistration', () => ({
  assessResumableRegistration: (...a: unknown[]) =>
    assessResumableRegistration(...a),
  isResumeOwner: (
    recordOwner: string | undefined,
    connectedOwner: string | null | undefined,
  ) =>
    !!recordOwner &&
    !!connectedOwner &&
    recordOwner.toLowerCase() === connectedOwner.toLowerCase(),
}))

vi.mock('../service/registrationPersistence', () => ({
  clearStoredRegistration: () => clearStoredRegistration(),
  loadStoredRegistration: () => loadStoredRegistration(),
}))

vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContext: () => useSmartAccountContext(),
}))

vi.mock('wagmi', () => ({ useConnection: () => useConnection() }))

vi.mock('@/lib/smart-account/sessionGate', () => ({
  needsSessionBeforeRegistration: (...a: unknown[]) =>
    needsSessionBeforeRegistration(...(a as [])),
}))

vi.mock('@/lib/wagmi', () => ({
  publicClient: { chain: { id: 11155111 } },
}))

vi.mock('sonner', () => ({ toast: (...a: unknown[]) => toast(...a) }))

/** What a session enabled mid-resume hands back, to use before any re-render. */
const enabledSession = () => ({
  signer: { type: 'rhinestone', session: 'fresh' },
  hcaSessionEnable: { stub: 'fresh-enable' },
})
const enableSession = vi.fn(async () => enabledSession())
const getSessionEnablePayload = vi.fn(async () => ({ stub: 'enable' }))

const account = (overrides: Record<string, unknown> = {}) => ({
  hasInitialized: true,
  ownerAddress: OWNER,
  accountAddress: '0xaaaa000000000000000000000000000000000001',
  signer: { type: 'rhinestone' },
  enableSession,
  getSessionEnablePayload,
  ...overrides,
})

const resumableAssessment = (): ResumeAssessment =>
  ({
    status: 'resumable',
    priceIsStale: false,
    confirmedData: { label: 'leon' },
    stored: {
      label: 'leon',
      record: { context: { ownerAddress: OWNER } },
      postRegistrationSetup: undefined,
    },
  }) as unknown as ResumeAssessment

/**
 * The slice of the UI machine the hook reads back: whether the restored failure
 * screen is still showing. `send` keeps it as the real machine would, and
 * `refuseResume` stands in for a resume the machine turns down (the wallet
 * busy in another tab, say), which leaves the screen restored.
 */
const ui = { restoredFailure: false, refuseResume: false }
const send = vi.fn()
const applyToUi = (event: { type: string }) => {
  if (event.type === 'registration.failure.restore') ui.restoredFailure = true
  if (event.type === 'cancel') ui.restoredFailure = false
  if (event.type === 'registration.resume' && !ui.refuseResume) {
    ui.restoredFailure = false
  }
}
const getSnapshot = () => ({
  context: {
    restoredFailure: ui.restoredFailure,
    confirmedData: { label: 'leon' },
  },
})
const uiActor = { send, getSnapshot } as unknown as RegistrationV2UiActor

// Retries stay with the query in production; in here they would only turn a
// deliberate rejection into a hang.
const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(
    QueryClientProvider,
    {
      client: new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
    },
    children,
  )

const render = (enabled?: boolean) =>
  renderHook(() => useRegistrationResume({ label: 'leon', uiActor, enabled }), {
    wrapper,
  })

describe('useRegistrationResume', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ui.restoredFailure = false
    ui.refuseResume = false
    send.mockImplementation(applyToUi)
    needsSessionBeforeRegistration.mockReturnValue(false)
    useSmartAccountContext.mockReturnValue(account())
    useConnection.mockReturnValue({ isDisconnected: false })
    loadStoredRegistration.mockReturnValue({ label: 'leon' })
    assessResumableRegistration.mockResolvedValue(resumableAssessment())
    enableSession.mockResolvedValue(enabledSession())
    getSessionEnablePayload.mockResolvedValue({ stub: 'enable' })
  })

  it('dispatches registration.resume for a resumable record', async () => {
    const { result } = render()

    await waitFor(() => expect(result.current.status).toBe('resumed'))
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'registration.resume', label: 'leon' }),
    )
    // The promised "Resuming registration" notice.
    expect(toast).toHaveBeenCalledOnce()
  })

  it('waits for the wallet before deciding anything', async () => {
    // Deciding "wrong wallet" mid-restore would show the banner to the very
    // user who owns the record.
    useSmartAccountContext.mockReturnValue(
      account({ hasInitialized: false, ownerAddress: null }),
    )

    const { result } = render()

    expect(result.current.status).toBe('checking')
    expect(assessResumableRegistration).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('does not hold the page when nothing is stored for this name', () => {
    // Known on the first render, before the wallet restores: a name with no
    // stored run renders pricing at once rather than waiting on an assessment
    // that can only answer "none".
    loadStoredRegistration.mockReturnValue(null)
    useSmartAccountContext.mockReturnValue(
      account({ hasInitialized: false, ownerAddress: null }),
    )

    const { result } = render()

    expect(result.current.status).toBe('idle')
  })

  it('does not hold the page for a record that belongs to another name', () => {
    loadStoredRegistration.mockReturnValue({ label: 'bob' })
    useSmartAccountContext.mockReturnValue(
      account({ hasInitialized: false, ownerAddress: null }),
    )

    const { result } = render()

    expect(result.current.status).toBe('idle')
  })

  it("never reports one name's verdict for the next", async () => {
    // The provider stays mounted across a label change. Untagged, leon's
    // "connect wallet" banner would show on bob's page until bob's own check
    // lands.
    useSmartAccountContext.mockReturnValue(account({ ownerAddress: null }))
    const { result, rerender } = renderHook(
      ({ label }) => useRegistrationResume({ label, uiActor }),
      { wrapper, initialProps: { label: 'leon' } },
    )
    await waitFor(() => expect(result.current.status).toBe('no-wallet'))

    assessResumableRegistration.mockResolvedValue({
      status: 'stale',
      reason: 'label-mismatch',
    })
    rerender({ label: 'bob' })

    expect(result.current.status).toBe('idle')
  })

  it('keeps the record out of sight of a different wallet', async () => {
    // Not theirs to resume: the page shows them plain pricing, naming no one,
    // and the record stays for its owner.
    useSmartAccountContext.mockReturnValue(account({ ownerAddress: OTHER }))

    const { result } = render()

    await waitFor(() => expect(result.current.status).toBe('wrong-wallet'))
    expect(result.current).toEqual({ status: 'wrong-wallet' })
    expect(send).not.toHaveBeenCalled()
    expect(clearStoredRegistration).not.toHaveBeenCalled()
  })

  it('names the owning wallet when no wallet is connected', async () => {
    useSmartAccountContext.mockReturnValue(account({ ownerAddress: null }))

    const { result } = render()

    await waitFor(() =>
      expect(result.current).toEqual({
        status: 'no-wallet',
        expectedOwner: OWNER,
      }),
    )
    expect(send).not.toHaveBeenCalled()
    expect(clearStoredRegistration).not.toHaveBeenCalled()
  })

  it('resumes once the right wallet connects', async () => {
    // The wrong-wallet verdict is deliberately un-latched. Connecting the
    // right wallet re-keys the assessment query, which re-decides.
    useSmartAccountContext.mockReturnValue(account({ ownerAddress: OTHER }))
    const { result, rerender } = render()
    await waitFor(() => expect(result.current.status).toBe('wrong-wallet'))

    useSmartAccountContext.mockReturnValue(account({ ownerAddress: OWNER }))
    rerender()

    await waitFor(() => expect(result.current.status).toBe('resumed'))
    expect(send).toHaveBeenCalledOnce()
  })

  it('discards an expired record, reports why, and notifies', async () => {
    assessResumableRegistration.mockResolvedValue({
      status: 'stale',
      reason: 'commitment-expired',
    })

    const { result } = render()

    await waitFor(() => expect(result.current.status).toBe('discarded'))
    expect(clearStoredRegistration).toHaveBeenCalledOnce()
    expect(send).not.toHaveBeenCalled()
    // The user paid for that commitment; its disappearance needs a notice.
    expect(toast).toHaveBeenCalledOnce()
  })

  it('discards a technical mismatch silently', async () => {
    assessResumableRegistration.mockResolvedValue({
      status: 'stale',
      reason: 'signer-mode-mismatch',
    })

    const { result } = render()

    await waitFor(() => expect(result.current.status).toBe('discarded'))
    expect(clearStoredRegistration).toHaveBeenCalledOnce()
    // A quiet restart is the correct surface — there is nothing actionable to
    // tell the user about an internal mode flip.
    expect(toast).not.toHaveBeenCalled()
  })

  it('leaves a record for another name alone', async () => {
    // Opening /register/bob while holding a paid commitment for leon must not
    // delete leon's record — coming back to /register/leon would then mean
    // paying for a second commitment. The write path overwrites the record if
    // a registration for bob actually starts.
    assessResumableRegistration.mockResolvedValue({
      status: 'stale',
      reason: 'label-mismatch',
    })

    const { result } = render()

    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(clearStoredRegistration).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })

  it('goes idle when there is nothing stored', async () => {
    assessResumableRegistration.mockResolvedValue({ status: 'none' })

    const { result } = render()

    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(clearStoredRegistration).not.toHaveBeenCalled()
  })

  it('enables an expired session before resuming', async () => {
    needsSessionBeforeRegistration.mockReturnValue(true)

    const { result } = render()

    await waitFor(() => expect(result.current.status).toBe('resumed'))
    expect(enableSession).toHaveBeenCalledOnce()
  })

  it('resumes with the session it just enabled, not the one it replaced', async () => {
    // The account was read before the prompt: until the next render its
    // signer and enable payload still belong to the expired session.
    needsSessionBeforeRegistration.mockReturnValue(true)

    const { result } = render()

    await waitFor(() => expect(result.current.status).toBe('resumed'))
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'registration.resume',
        account: expect.objectContaining({ signer: enabledSession().signer }),
        hcaSessionEnable: enabledSession().hcaSessionEnable,
      }),
    )
    expect(getSessionEnablePayload).not.toHaveBeenCalled()
  })

  it('does not re-prompt when the account context churns mid-enable', async () => {
    // `enableSession()` itself flips `isEnablingSession` in the provider,
    // re-creating the context object. An effect keyed on that object cancelled
    // the in-flight tail and started a second one — a duplicate wallet prompt
    // while the first was still open, and a resume that only completed via a
    // lucky later re-run.
    needsSessionBeforeRegistration.mockReturnValue(true)
    let resolveEnable: (enabled: ReturnType<typeof enabledSession>) => void =
      () => {}
    enableSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEnable = resolve
        }) as never,
    )

    const { result, rerender } = render()
    await waitFor(() => expect(enableSession).toHaveBeenCalledOnce())

    // The provider re-renders with a NEW context object holding the same
    // wallet identity — exactly what the isEnablingSession flip produces.
    useSmartAccountContext.mockReturnValue(account())
    rerender()
    expect(enableSession).toHaveBeenCalledOnce()

    resolveEnable(enabledSession())
    await waitFor(() => expect(result.current.status).toBe('resumed'))
    expect(enableSession).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledOnce()
  })

  it('keeps the record when the session enable is rejected', async () => {
    needsSessionBeforeRegistration.mockReturnValue(true)
    enableSession.mockResolvedValue(null as never)

    const { result } = render()

    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(send).not.toHaveBeenCalled()
    expect(clearStoredRegistration).not.toHaveBeenCalled()
  })

  it('recovers when the resume check throws instead of parking at checking', async () => {
    // Regression for the review finding: `enableSession()` and
    // `getSessionEnablePayload()` can both REJECT. A success-only `.then()`
    // left an unhandled rejection and pinned the hook at `checking` forever,
    // with the record intact but never picked up.
    needsSessionBeforeRegistration.mockReturnValue(true)
    enableSession.mockRejectedValue(new Error('wallet disconnected'))

    const { result } = render()

    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(send).not.toHaveBeenCalled()
    // The record is still valid — it must survive for the next attempt.
    expect(clearStoredRegistration).not.toHaveBeenCalled()
  })

  it('stays retryable after a throw, so a reconnect can still resume', async () => {
    // An RPC failure while no wallet is connected must not latch. Connecting a
    // wallet re-keys the assessment query, which refetches — that is the
    // recovery path.
    assessResumableRegistration.mockRejectedValueOnce(new Error('rpc down'))
    useSmartAccountContext.mockReturnValue(account({ ownerAddress: null }))

    const { result, rerender } = render()
    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(send).not.toHaveBeenCalled()

    useSmartAccountContext.mockReturnValue(account())
    rerender()

    await waitFor(() => expect(result.current.status).toBe('resumed'))
    expect(send).toHaveBeenCalledOnce()
  })

  it('decides once per label rather than on every account re-render', async () => {
    const { result, rerender } = render()
    await waitFor(() => expect(result.current.status).toBe('resumed'))

    rerender()
    rerender()

    // A second dispatch would re-enter a flow that is already running.
    expect(send).toHaveBeenCalledOnce()
  })

  describe('a run that had failed', () => {
    const failedAssessment = (): ResumeAssessment =>
      ({ ...resumableAssessment(), status: 'failed' }) as ResumeAssessment

    const pressTryAgain = (state: { status: string; retry?: () => void }) => {
      act(() => {
        state.retry?.()
      })
    }

    beforeEach(() => {
      assessResumableRegistration.mockResolvedValue(failedAssessment())
      // An expired session is exactly what would put a prompt up on load.
      needsSessionBeforeRegistration.mockReturnValue(true)
    })

    it('comes back on the failure screen without re-running anything', async () => {
      const { result } = render()

      await waitFor(() => expect(result.current.status).toBe('failed'))
      expect(send).toHaveBeenCalledOnce()
      expect(send).toHaveBeenCalledWith({
        type: 'registration.failure.restore',
        confirmedData: { label: 'leon' },
      })
      // Nothing runs until the user asks: no wallet prompt, no "Resuming"
      // notice, and the commitment stays stored.
      expect(enableSession).not.toHaveBeenCalled()
      expect(toast).not.toHaveBeenCalled()
      expect(clearStoredRegistration).not.toHaveBeenCalled()
    })

    it('continues from the stored commitment on Try Again', async () => {
      const { result } = render()
      await waitFor(() => expect(result.current.status).toBe('failed'))

      pressTryAgain(result.current)

      await waitFor(() => expect(result.current.status).toBe('resumed'))
      expect(enableSession).toHaveBeenCalledOnce()
      expect(send).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'registration.resume',
          label: 'leon',
          account: expect.objectContaining({ signer: enabledSession().signer }),
          hcaSessionEnable: enabledSession().hcaSessionEnable,
        }),
      )
    })

    it('checks the chain again before continuing', async () => {
      // The screen may have sat open long enough for the commitment to
      // expire, or for the failed register to land after all and use it up.
      const { result } = render()
      await waitFor(() => expect(result.current.status).toBe('failed'))
      assessResumableRegistration.mockResolvedValue({
        status: 'stale',
        reason: 'commitment-expired',
      })

      pressTryAgain(result.current)

      await waitFor(() => expect(result.current.status).toBe('discarded'))
      expect(assessResumableRegistration).toHaveBeenCalledTimes(2)
      expect(clearStoredRegistration).toHaveBeenCalledOnce()
      expect(send).toHaveBeenLastCalledWith({ type: 'cancel' })
      expect(enableSession).not.toHaveBeenCalled()
      // The expiry notice: the user paid for that commitment.
      expect(toast).toHaveBeenCalledOnce()
    })

    it('keeps Try Again available when the session is declined', async () => {
      enableSession.mockResolvedValueOnce(null as never)
      const { result } = render()
      await waitFor(() => expect(result.current.status).toBe('failed'))

      pressTryAgain(result.current)
      await waitFor(() => expect(enableSession).toHaveBeenCalledOnce())
      await act(async () => {})

      expect(result.current.status).toBe('failed')
      expect(send).toHaveBeenCalledOnce()

      pressTryAgain(result.current)
      await waitFor(() => expect(result.current.status).toBe('resumed'))
    })

    it('keeps Try Again here when the machine turns the resume down', async () => {
      // A refused resume leaves the restored screen up; the next press has to
      // come back through here, with a fresh account and a fresh check.
      ui.refuseResume = true
      const { result } = render()
      await waitFor(() => expect(result.current.status).toBe('failed'))

      pressTryAgain(result.current)
      await waitFor(() =>
        expect(send).toHaveBeenLastCalledWith(
          expect.objectContaining({ type: 'registration.resume' }),
        ),
      )
      await act(async () => {})
      expect(result.current.status).toBe('failed')

      ui.refuseResume = false
      pressTryAgain(result.current)
      await waitFor(() => expect(result.current.status).toBe('resumed'))
    })

    it('does not resume a failure screen the user has already left', async () => {
      // Back to Quote, or another name, while Try Again was still checking.
      const { result } = render()
      await waitFor(() => expect(result.current.status).toBe('failed'))
      ui.restoredFailure = false

      pressTryAgain(result.current)
      await waitFor(() =>
        expect(assessResumableRegistration).toHaveBeenCalledTimes(2),
      )
      await act(async () => {})

      expect(send).toHaveBeenCalledOnce()
      expect(enableSession).not.toHaveBeenCalled()
      expect(result.current.status).toBe('failed')
    })
  })

  describe('a different wallet connecting mid-run', () => {
    /** A live run in this tab, started by OWNER: nothing was stored at mount. */
    const renderLiveRun = (options: { enabled?: boolean } = {}) => {
      assessResumableRegistration.mockResolvedValue({ status: 'none' })
      loadStoredRegistration.mockReturnValue(null)

      return renderHook(
        ({ runOwner }: { runOwner?: Address }) =>
          useRegistrationResume({
            label: 'leon',
            uiActor,
            enabled: options.enabled,
            suspendableRunOwner: runOwner,
          }),
        { wrapper, initialProps: { runOwner: OWNER as Address | undefined } },
      )
    }

    const suspends = () =>
      send.mock.calls.filter(([e]) => e.type === 'registration.suspend')

    it('suspends the run out of sight of that wallet, and resumes for the owner', async () => {
      const { result, rerender } = renderLiveRun()
      await waitFor(() => expect(result.current.status).toBe('idle'))

      // By now the run has written its record, owned by OWNER.
      assessResumableRegistration.mockResolvedValue(resumableAssessment())
      useSmartAccountContext.mockReturnValue(account({ ownerAddress: OTHER }))
      rerender({ runOwner: OWNER })

      expect(suspends()).toHaveLength(1)
      // Held on the placeholder, not flashed to plain pricing, while deciding.
      expect(result.current.status).toBe('checking')

      rerender({ runOwner: undefined }) // The UI machine is back on pricing.
      await waitFor(() => expect(result.current.status).toBe('wrong-wallet'))

      useSmartAccountContext.mockReturnValue(account({ ownerAddress: OWNER }))
      rerender({ runOwner: undefined })

      await waitFor(() => expect(result.current.status).toBe('resumed'))
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'registration.resume' }),
      )
    })

    it('stops the run once a real disconnect outlasts the grace period', async () => {
      // Otherwise it carries on in the background for a wallet the page no
      // longer shows, and may finish before the user comes back.
      const { result, rerender } = renderLiveRun()
      await waitFor(() => expect(result.current.status).toBe('idle'))

      assessResumableRegistration.mockResolvedValue(resumableAssessment())
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        useConnection.mockReturnValue({ isDisconnected: true })
        useSmartAccountContext.mockReturnValue(account({ ownerAddress: null }))
        rerender({ runOwner: OWNER })

        act(() => vi.advanceTimersByTime(DISCONNECT_GRACE_MS - 1))
        expect(suspends()).toHaveLength(0)

        act(() => vi.advanceTimersByTime(1))
        expect(suspends()).toHaveLength(1)
      } finally {
        vi.useRealTimers()
      }

      rerender({ runOwner: undefined }) // The UI machine is back on pricing.
      await waitFor(() =>
        expect(result.current).toEqual({
          status: 'no-wallet',
          expectedOwner: OWNER,
        }),
      )
    })

    it('rides out a disconnect shorter than the grace period', async () => {
      const { result, rerender } = renderLiveRun()
      await waitFor(() => expect(result.current.status).toBe('idle'))

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        useConnection.mockReturnValue({ isDisconnected: true })
        useSmartAccountContext.mockReturnValue(account({ ownerAddress: null }))
        rerender({ runOwner: OWNER })
        act(() => vi.advanceTimersByTime(DISCONNECT_GRACE_MS / 2))

        useConnection.mockReturnValue({ isDisconnected: false })
        useSmartAccountContext.mockReturnValue(account())
        rerender({ runOwner: OWNER })
        act(() => vi.advanceTimersByTime(DISCONNECT_GRACE_MS * 2))
      } finally {
        vi.useRealTimers()
      }

      expect(suspends()).toHaveLength(0)
    })

    it('ignores a null owner while wagmi still reports a wallet', async () => {
      // The owner address reads null for a moment during reconnects; bouncing
      // the run back to pricing on that would interrupt a healthy
      // registration.
      const { result, rerender } = renderLiveRun()
      await waitFor(() => expect(result.current.status).toBe('idle'))

      useSmartAccountContext.mockReturnValue(account({ ownerAddress: null }))
      rerender({ runOwner: OWNER })
      useSmartAccountContext.mockReturnValue(
        account({ ownerAddress: OWNER.toLowerCase() }),
      )
      rerender({ runOwner: OWNER })

      expect(suspends()).toHaveLength(0)
    })

    it('leaves the run alone when resume is switched off', async () => {
      // Nothing could bring the run back, so stopping it would only strand the
      // payment already made.
      const { rerender } = renderLiveRun({ enabled: false })

      useSmartAccountContext.mockReturnValue(account({ ownerAddress: OTHER }))
      rerender({ runOwner: OWNER })

      expect(suspends()).toHaveLength(0)
    })
  })

  it('does nothing at all when disabled', async () => {
    const { result } = render(false)

    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(assessResumableRegistration).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('passes the live signer type so a mode flip is caught', async () => {
    render()

    await waitFor(() => expect(assessResumableRegistration).toHaveBeenCalled())
    expect(assessResumableRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'leon', signerType: 'rhinestone' }),
    )
  })
})
