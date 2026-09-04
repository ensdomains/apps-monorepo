import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResumeAssessment } from '../service/assessResumableRegistration'
import type { RegistrationV2UiActor } from './registrationUi.machine'
import { useRegistrationResume } from './useRegistrationResume'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const OTHER = '0x2222222222222222222222222222222222222222' as Address

const assessResumableRegistration = vi.fn()
const clearStoredRegistration = vi.fn()
const needsSessionBeforeRegistration = vi.fn(() => false)
const useSmartAccountContext = vi.fn()
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
}))

vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContext: () => useSmartAccountContext(),
}))

vi.mock('@/lib/smart-account/sessionGate', () => ({
  needsSessionBeforeRegistration: (...a: unknown[]) =>
    needsSessionBeforeRegistration(...(a as [])),
}))

vi.mock('@/lib/wagmi', () => ({
  publicClient: { chain: { id: 11155111 } },
}))

vi.mock('sonner', () => ({ toast: (...a: unknown[]) => toast(...a) }))

const enableSession = vi.fn(async () => ({ type: 'rhinestone' }))
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

const send = vi.fn()
const uiActor = { send } as unknown as RegistrationV2UiActor

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
    needsSessionBeforeRegistration.mockReturnValue(false)
    useSmartAccountContext.mockReturnValue(account())
    assessResumableRegistration.mockResolvedValue(resumableAssessment())
    enableSession.mockResolvedValue({ type: 'rhinestone' })
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

  it('does not resume for a different wallet', async () => {
    useSmartAccountContext.mockReturnValue(account({ ownerAddress: OTHER }))

    const { result } = render()

    await waitFor(() => expect(result.current.status).toBe('wrong-wallet'))
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

  it('does not re-prompt when the account context churns mid-enable', async () => {
    // `enableSession()` itself flips `isEnablingSession` in the provider,
    // re-creating the context object. An effect keyed on that object cancelled
    // the in-flight tail and started a second one — a duplicate wallet prompt
    // while the first was still open, and a resume that only completed via a
    // lucky later re-run.
    needsSessionBeforeRegistration.mockReturnValue(true)
    let resolveEnable: (signer: { type: string }) => void = () => {}
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

    resolveEnable({ type: 'rhinestone' })
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
