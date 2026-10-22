import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnableSessionOutcome } from '@/lib/smart-account/SmartAccountContext'
import { render } from '@/utils/test-utils'
import { useSmartSessionGate } from './useSmartSessionGate'

const enableSession = vi.fn<() => Promise<EnableSessionOutcome>>()

vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContext: () => ({
    enableSession,
    isEnablingSession: false,
    signer: { type: 'rhinestone' },
    hasActiveSession: false,
    activeStoredSession: null,
  }),
}))

const proceed = vi.fn()

const Harness = () => {
  const { gate, sessionModal } = useSmartSessionGate()
  return (
    <>
      <button onClick={() => gate(proceed)} type="button">
        Next
      </button>
      {sessionModal}
    </>
  )
}

const openDialog = () => {
  fireEvent.click(screen.getByText('Next'))
  return screen.getByRole('dialog')
}

const enabled: EnableSessionOutcome = {
  status: 'enabled',
  session: { signer: { type: 'rhinestone' }, hcaSessionEnable: {} } as never,
}

describe('useSmartSessionGate', () => {
  beforeEach(() => {
    enableSession.mockReset()
    proceed.mockReset()
  })

  it('runs the deferred action once the session is enabled', async () => {
    enableSession.mockResolvedValue(enabled)
    render(<Harness />)
    openDialog()

    fireEvent.click(screen.getByText('Enable Sessions'))

    await waitFor(() => expect(proceed).toHaveBeenCalledOnce())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes without an error when the wallet signature is declined', async () => {
    enableSession.mockResolvedValue({ status: 'declined' })
    render(<Harness />)
    openDialog()

    fireEvent.click(screen.getByText('Enable Sessions'))

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(proceed).not.toHaveBeenCalled()
  })

  it('shows Try Again on a failure, can be closed, and reopens clean', async () => {
    enableSession.mockResolvedValue({ status: 'failed', message: 'boom' })
    render(<Harness />)
    openDialog()

    fireEvent.click(screen.getByText('Enable Sessions'))
    expect(await screen.findByText('Try Again')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )

    openDialog()
    expect(screen.getByText('Enable Sessions')).toBeInTheDocument()
  })

  it('a request enabled after dismiss and reopen closes the new prompt and runs its action', async () => {
    let resolve: (outcome: EnableSessionOutcome) => void = () => {}
    enableSession.mockReturnValue(
      new Promise<EnableSessionOutcome>((r) => {
        resolve = r
      }),
    )
    render(<Harness />)
    openDialog()
    fireEvent.click(screen.getByText('Enable Sessions'))

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    })
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    openDialog()

    resolve(enabled)
    await waitFor(() => expect(proceed).toHaveBeenCalledOnce())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ignores the result of a request dismissed before it finished, even after reopening', async () => {
    let resolve: (outcome: EnableSessionOutcome) => void = () => {}
    enableSession.mockReturnValue(
      new Promise<EnableSessionOutcome>((r) => {
        resolve = r
      }),
    )
    render(<Harness />)
    openDialog()
    fireEvent.click(screen.getByText('Enable Sessions'))

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    })
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    openDialog()

    resolve({ status: 'failed', message: 'boom' })
    await waitFor(() => expect(enableSession).toHaveBeenCalledOnce())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Enable Sessions')).toBeInTheDocument()
    expect(proceed).not.toHaveBeenCalled()
  })
})
