import { TransactionRevertedError } from '@ens-apps/transaction-manager/errors/transaction.errors'
import { assert, describe, expect, it } from 'vitest'
import {
  toRevokeMigrationApprovalError,
  verifyMigrationApprovalRevocationReceipt,
} from './revokeMigrationApproval.helpers'

describe('migration approval revocation verification', () => {
  it('reports an inner Safe failure with the same user message as a reverted transaction', () => {
    const cause = new TransactionRevertedError('Safe execution failed')
    const safeError = toRevokeMigrationApprovalError(cause)
    const reverted = verifyMigrationApprovalRevocationReceipt({
      status: 'reverted',
    })
    assert(reverted.isErr())
    expect(safeError.message).toBe(reverted.error.message)
    expect(safeError.cause).toBe(cause)
  })

  it('preserves a wallet error for the mutation boundary', () => {
    const cause = new Error('Wallet is locked')
    const error = toRevokeMigrationApprovalError(cause)
    expect(error.message).toBe('Wallet is locked')
    expect(error.cause).toBe(cause)
  })

  it('accepts only successful receipts', () => {
    expect(
      verifyMigrationApprovalRevocationReceipt({ status: 'success' }).isOk(),
    ).toBe(true)
    expect(
      verifyMigrationApprovalRevocationReceipt({ status: 'reverted' }).isErr(),
    ).toBe(true)
  })
})
