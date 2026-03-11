import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SetSubregistryTransactionStatus } from './SetSubregistryTransactionStatus'

vi.mock('@/utils/blockExplorer/useBlockExplorerUrl', () => ({
  useBlockExplorerTxUrl: () => undefined,
}))

vi.mock('@/features/registry/utils/transactionErrorMessage', () => ({
  getTransactionErrorInfo: (error: { message?: string }) => ({
    summary: error?.message ?? 'Transaction failed',
    details: error?.message,
  }),
}))

describe('SetSubregistryTransactionStatus', () => {
  const defaultProps = {
    txHash: undefined as `0x${string}` | undefined,
    isSettingSubregistry: false,
    isConfirming: false,
    isConfirmed: false,
    isReverted: false,
    txError: null,
    receiptError: null,
  }

  it('returns null when not setting, no txHash, and no errors', () => {
    const { container } = render(
      <SetSubregistryTransactionStatus {...defaultProps} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows Set Subregistry Failed when txError is set', () => {
    render(
      <SetSubregistryTransactionStatus
        {...defaultProps}
        txError={{ message: 'User rejected' }}
      />,
    )
    expect(screen.getByText('Set Subregistry Failed')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('User rejected')
  })

  it('shows Set Subregistry Failed when receiptError is set', () => {
    render(
      <SetSubregistryTransactionStatus
        {...defaultProps}
        receiptError={{ message: 'Reverted' }}
      />,
    )
    expect(screen.getByText('Set Subregistry Failed')).toBeInTheDocument()
  })

  it('shows Set Subregistry Failed when isReverted is true', () => {
    render(
      <SetSubregistryTransactionStatus
        {...defaultProps}
        isReverted
        txHash="0xabc"
      />,
    )
    expect(screen.getByText('Set Subregistry Failed')).toBeInTheDocument()
  })

  it('shows success state with Subregistry Set when confirmed', () => {
    render(
      <SetSubregistryTransactionStatus
        {...defaultProps}
        txHash="0xabc123"
        isConfirmed
      />,
    )
    expect(screen.getByText('Subregistry Set')).toBeInTheDocument()
    expect(
      screen.getByText('Subregistry successfully set!'),
    ).toBeInTheDocument()
    expect(screen.getByText('0xabc123')).toBeInTheDocument()
  })

  it('shows Setting Subregistry when isSettingSubregistry', () => {
    render(
      <SetSubregistryTransactionStatus
        {...defaultProps}
        isSettingSubregistry
      />,
    )
    expect(screen.getByText('Setting Subregistry')).toBeInTheDocument()
    expect(
      screen.getByText('Please confirm the transaction in your wallet...'),
    ).toBeInTheDocument()
  })

  it('shows Confirming when isConfirming and has txHash', () => {
    render(
      <SetSubregistryTransactionStatus
        {...defaultProps}
        txHash="0xabc"
        isConfirming
      />,
    )
    expect(screen.getByText('Confirming...')).toBeInTheDocument()
    expect(screen.getByText('Waiting for confirmation...')).toBeInTheDocument()
  })
})
