import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSmartSessionGate } from './useSmartSessionGate'

const mocks = vi.hoisted(() => ({
  account: {
    accountAddress: undefined,
    activeStoredSession: undefined,
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
  it('passes the newly enabled session when proceeding', async () => {
    const onProceed = vi.fn()
    const enabledSession = {
      signer: { type: 'rhinestone' as const },
      sessionEnable: {
        enableData: {},
        permissionId: '0x1234',
        sessionKey: '0x1111111111111111111111111111111111111111',
        validUntil: 1n,
      },
    }
    mocks.account.hasActiveSession = false
    mocks.account.enableSession.mockResolvedValue(enabledSession)
    render(<Harness onProceed={onProceed} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enable session' }))
    })

    expect(onProceed).toHaveBeenCalledWith(enabledSession)
  })
})
