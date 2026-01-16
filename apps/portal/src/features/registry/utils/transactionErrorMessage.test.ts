import { describe, expect, it } from 'vitest'
import { getTransactionErrorInfo } from './transactionErrorMessage'

describe('getTransactionErrorInfo', () => {
  it('returns a short message for user rejection errors', () => {
    const message =
      'Transaction Failed\nUser rejected the request. Request Arguments: ... Details: MetaMask Tx Signature: User denied transaction signature.'

    const result = getTransactionErrorInfo({ message })

    expect(result.summary).toBe('Transaction rejected in wallet.')
    expect(result.details).toContain('User rejected the request.')
  })

  it('prefers shortMessage when provided', () => {
    const error = {
      shortMessage: 'User rejected the request.',
      message: 'User rejected the request. Request Arguments: ...',
    }

    const result = getTransactionErrorInfo(error)

    expect(result.summary).toBe('Transaction rejected in wallet.')
    expect(result.details).toContain('User rejected the request.')
  })

  it('maps insufficient funds errors to a friendly message', () => {
    const error = {
      message: 'insufficient funds for gas * price + value (extra details)',
    }

    const result = getTransactionErrorInfo(error)

    expect(result.summary).toBe(
      'Insufficient funds to complete the transaction.',
    )
    expect(result.details).toContain('insufficient funds')
  })

  it('extracts a revert reason when available', () => {
    const error = {
      message:
        'Execution reverted: Registry not found. Request Arguments: ... Docs: https://viem.sh/...',
    }

    const result = getTransactionErrorInfo(error)

    expect(result.summary).toBe('Execution reverted: Registry not found.')
    expect(result.details).toContain('Execution reverted: Registry not found.')
  })
})
