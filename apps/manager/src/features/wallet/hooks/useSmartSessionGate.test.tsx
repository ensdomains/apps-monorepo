import {
  type RhinestoneStoredSession,
  SESSION_REGISTRATION_HEADROOM_SECONDS,
} from '@ens-apps/smart-account'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSmartSessionGate } from './useSmartSessionGate'

const mocks = vi.hoisted(() => ({
  account: {
    accountAddress: undefined,
    activeStoredSession: null as RhinestoneStoredSession | null,
    enableSession: vi.fn(),
    hasActiveSession: false,
    isEnablingSession: false,
    ownerAddress: undefined,
    sessionError: null,
    signer: { type: 'rhinestone' as const },
  },
}))

vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContext: () => mocks.account,
}))

vi.mock('../components/EnableSessionModal', () => ({
  EnableSessionModal: ({
    onEnableSession,
    open,
  }: {
    onEnableSession: () => void
    open: boolean
  }) =>
    open ? (
      <button onClick={onEnableSession} type="button">
        Enable session
      </button>
    ) : null,
}))

const Harness = ({ onProceed }: { onProceed: () => void }) => {
  const { gate, sessionModal } = useSmartSessionGate()
  return (
    <>
      <button onClick={() => gate(onProceed)} type="button">
        Start
      </button>
      {sessionModal}
    </>
  )
}

describe('useSmartSessionGate', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    mocks.account.activeStoredSession = null
    mocks.account.hasActiveSession = false
  })

  it('rechecks session headroom when the gated action starts', () => {
    const now = new Date('2026-09-23T00:00:00Z')
    vi.useFakeTimers({ now })
    const onProceed = vi.fn()
    mocks.account.hasActiveSession = true
    mocks.account.activeStoredSession = {
      validUntil:
        Math.floor(now.getTime() / 1000) +
        SESSION_REGISTRATION_HEADROOM_SECONDS +
        5,
    } as RhinestoneStoredSession
    render(<Harness onProceed={onProceed} />)

    vi.advanceTimersByTime(10_000)
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    expect(onProceed).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Enable session' })).toBeTruthy()
  })

  it('waits for refreshed session context before proceeding', async () => {
    const onProceed = vi.fn()
    mocks.account.hasActiveSession = false
    mocks.account.enableSession.mockResolvedValue({ type: 'rhinestone' })
    const view = render(<Harness onProceed={onProceed} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enable session' }))
    })

    expect(onProceed).not.toHaveBeenCalled()

    mocks.account.hasActiveSession = true
    view.rerender(<Harness onProceed={onProceed} />)

    expect(onProceed).toHaveBeenCalledOnce()
  })
})
