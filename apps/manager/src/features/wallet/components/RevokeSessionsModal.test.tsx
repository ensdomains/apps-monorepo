import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { RevokeSessionsModal } from './RevokeSessionsModal'

type Props = ComponentProps<typeof RevokeSessionsModal>

const HCA = '0x44c793a91362ca416E5d18dECe728D82883e8696'

const renderModal = (overrides: Partial<Props> = {}) => {
  const props: Props = {
    open: true,
    onOpenChange: vi.fn(),
    onRevokeSessions: vi.fn().mockResolvedValue(true),
    onForgetLocalSession: vi.fn(),
    smartAccountAddress: HCA,
    ...overrides,
  }
  render(<RevokeSessionsModal {...props} />)
  return props
}

describe('RevokeSessionsModal (WEB-674)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('states the scope and the gas cost before the wallet opens', () => {
    renderModal()

    expect(
      screen.getByRole('dialog', { name: 'Revoke smart sessions' }),
    ).toBeInTheDocument()
    expect(screen.getByText('0x44c7...8696')).toBeInTheDocument()
    expect(
      screen.getByText(/in every browser and on every device/),
    ).toBeInTheDocument()
    expect(screen.getByText(/so it costs gas/)).toBeInTheDocument()
  })

  it('revokes without deploying, and closes once the revoke confirms', async () => {
    const props = renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Revoke sessions' }))

    await waitFor(() => expect(props.onOpenChange).toHaveBeenCalledWith(false))
    expect(props.onRevokeSessions).toHaveBeenCalledTimes(1)
    expect(props.onRevokeSessions).toHaveBeenCalledWith(undefined)
  })

  it('stays open on failure so the error remains visible', async () => {
    const props = renderModal({
      onRevokeSessions: vi.fn().mockResolvedValue(false),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Revoke sessions' }))

    await waitFor(() => expect(props.onRevokeSessions).toHaveBeenCalled())
    expect(props.onOpenChange).not.toHaveBeenCalled()
  })

  it('offers Try Again with the error shown', () => {
    renderModal({ errorMessage: "Couldn't revoke sessions. Please try again." })

    expect(
      screen.getByText("Couldn't revoke sessions. Please try again."),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Try Again' }),
    ).toBeInTheDocument()
  })

  it('asks to deploy first for an undeployed account, and says it is two transactions', async () => {
    const props = renderModal({ isUndeployed: true })

    expect(screen.getByText(/two transactions/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Set up and revoke' }))

    await waitFor(() =>
      expect(props.onRevokeSessions).toHaveBeenCalledWith({
        deployFirst: true,
      }),
    )
  })

  it('offers the gas-free local clear only for an undeployed account with a saved session', () => {
    renderModal({ isUndeployed: true, hasLocalSession: false })
    expect(
      screen.queryByRole('button', { name: 'Remove saved session' }),
    ).not.toBeInTheDocument()
  })

  it('never offers the local clear for a deployed account, even with a saved session', () => {
    renderModal({ isUndeployed: false, hasLocalSession: true })
    expect(
      screen.getByRole('button', { name: 'Revoke sessions' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Remove saved session' }),
    ).not.toBeInTheDocument()
  })

  it('clears only the local copy, without revoking, and closes', () => {
    const props = renderModal({ isUndeployed: true, hasLocalSession: true })

    expect(
      screen.getByText(/doesn't stop a copy made elsewhere/),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove saved session' }),
    )

    expect(props.onForgetLocalSession).toHaveBeenCalledTimes(1)
    expect(props.onRevokeSessions).not.toHaveBeenCalled()
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('locks every control and cannot be dismissed while the transaction is in flight', () => {
    const props = renderModal({
      isRevoking: true,
      isUndeployed: true,
      hasLocalSession: true,
    })

    expect(screen.getByRole('button', { name: 'Revoking…' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Remove saved session' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Revoking…' }))

    expect(props.onOpenChange).not.toHaveBeenCalled()
    expect(props.onRevokeSessions).not.toHaveBeenCalled()
  })
})
