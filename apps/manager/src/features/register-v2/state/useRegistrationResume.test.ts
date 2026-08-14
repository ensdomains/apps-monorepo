import { renderHook, waitFor } from '@testing-library/react'
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

const render = () =>
  renderHook(() => useRegistrationResume({ label: 'leon', uiActor }))

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
    // The wrong-wallet verdict is deliberately un-latched. It re-decides when
    // the account object changes — which is what connecting a wallet does —
    // not on every render.
    useSmartAccountContext.mockReturnValue(account({ ownerAddress: OTHER }))
    const { result, rerender } = render()
    await waitFor(() => expect(result.current.status).toBe('wrong-wallet'))

    useSmartAccountContext.mockReturnValue(account({ ownerAddress: OWNER }))
    rerender()

    await waitFor(() => expect(result.current.status).toBe('resumed'))
    expect(send).toHaveBeenCalledOnce()
  })

  it('discards a stale record and reports why', async () => {
    assessResumableRegistration.mockResolvedValue({
      status: 'stale',
      reason: 'commitment-expired',
    })

    const { result } = render()

    await waitFor(() => expect(result.current.status).toBe('discarded'))
    expect(clearStoredRegistration).toHaveBeenCalledOnce()
    expect(send).not.toHaveBeenCalled()
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
    assessResumableRegistration.mockRejectedValueOnce(new Error('rpc down'))

    const { result, rerender } = render()
    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(send).not.toHaveBeenCalled()

    // A throw must not latch. Re-deciding on the next account change is the
    // recovery path — without the catch this would still be stuck at
    // `checking` and no rerender would help.
    assessResumableRegistration.mockResolvedValue(resumableAssessment())
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
    const { result } = renderHook(() =>
      useRegistrationResume({ label: 'leon', uiActor, enabled: false }),
    )

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
