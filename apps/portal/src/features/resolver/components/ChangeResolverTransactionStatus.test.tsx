import { render, screen } from '@testing-library/react'
import type { Hash } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { ChangeResolverTransactionStatus } from './ChangeResolverTransactionStatus'

vi.mock('@/features/registry/utils/transactionErrorMessage', () => ({
  getTransactionErrorInfo: (error: { message?: string }) => ({
    summary: error?.message ?? 'Transaction failed',
    details: error?.message,
  }),
}))

describe('ChangeResolverTransactionStatus', () => {
  const defaultProps = {
    txHash: undefined as Hash | undefined,
    isConfirming: false,
    isConfirmed: false,
    isReverted: false,
    txError: null,
    receiptError: null,
  }

  it('returns null when no txHash and no errors', () => {
    const { container } = render(
      <ChangeResolverTransactionStatus {...defaultProps} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows Transaction Failed alert when txError is set', () => {
    render(
      <ChangeResolverTransactionStatus
        {...defaultProps}
        txError={{ message: 'User rejected' }}
      />,
    )
    expect(screen.getByText('Transaction Failed')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('User rejected')
  })

  it('shows Receipt Error alert when receiptError is set', () => {
    render(
      <ChangeResolverTransactionStatus
        {...defaultProps}
        receiptError={{ message: 'Receipt failed' }}
      />,
    )
    expect(screen.getByText('Receipt Error')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Receipt failed')
  })

  it('shows Transaction Reverted alert when isReverted is true', () => {
    render(
      <ChangeResolverTransactionStatus
        {...defaultProps}
        isReverted
        txHash="0xabc"
      />,
    )
    expect(screen.getByText('Transaction Reverted')).toBeInTheDocument()
    expect(
      screen.getByText('The transaction was reverted on-chain.'),
    ).toBeInTheDocument()
  })

  it('shows success state with txHash when no errors', () => {
    render(
      <ChangeResolverTransactionStatus
        {...defaultProps}
        txHash="0xabc123"
        isConfirmed
      />,
    )
    expect(screen.getByText('Resolver Changed')).toBeInTheDocument()
    expect(screen.getByText('Transaction confirmed!')).toBeInTheDocument()
    expect(screen.getByText('0xabc123')).toBeInTheDocument()
  })

  it('shows Changing Resolver and waiting message when isConfirming', () => {
    render(
      <ChangeResolverTransactionStatus
        {...defaultProps}
        txHash="0xabc123"
        isConfirming
      />,
    )
    expect(screen.getByText('Changing Resolver')).toBeInTheDocument()
    expect(screen.getByText('Waiting for confirmation...')).toBeInTheDocument()
  })
})
