import { describe, expect, it } from 'vitest'
import type { ActiveTransactionState } from '../hooks/useActiveTransactionState'
import type { Transaction } from '../types'
import { getStatus } from './getStatus'

const createTransaction = (
  overrides: Partial<Transaction> = {},
): Transaction => ({
  id: 'save-records',
  title: 'Save records',
  transactionName: 'Set resolver records',
  estimatedGasCost: 0.0001,
  onStart: () => {},
  onDone: () => {},
  ...overrides,
})

const createTxState = (
  overrides: Partial<ActiveTransactionState> = {},
): ActiveTransactionState => ({
  txId: 'save-records',
  machineState: 'submitting',
  hash: undefined,
  error: undefined,
  ...overrides,
})

describe('getStatus', () => {
  it('delegates to getTransactionStatus for single transaction', () => {
    const txState = createTxState({
      txId: 'save-records',
      machineState: 'success',
    })
    const transaction = createTransaction({ id: 'save-records' })
    const transactions = [transaction]
    expect(getStatus(transactions, transaction, txState)).toBe('success')
  })

  it('returns undefined for single transaction when ids do not match', () => {
    const txState = createTxState({ txId: 'other-tx' })
    const transaction = createTransaction({ id: 'save-records' })
    const transactions = [transaction]
    expect(getStatus(transactions, transaction, txState)).toBeUndefined()
  })

  it('delegates to getTransactionStatusInFlow for multiple transactions', () => {
    const deployTx = createTransaction({ id: 'deploy' })
    const changeTx = createTransaction({ id: 'change' })
    const transactions = [deployTx, changeTx]
    const txState = createTxState({
      txId: 'change',
      machineState: 'success',
    })
    expect(getStatus(transactions, changeTx, txState)).toBe('success')
  })

  it('returns success for completed transaction in multi-step flow', () => {
    const deployTx = createTransaction({ id: 'deploy' })
    const changeTx = createTransaction({ id: 'change' })
    const transactions = [deployTx, changeTx]
    const txState = createTxState({
      txId: 'change',
      machineState: 'submitting',
    })
    expect(getStatus(transactions, deployTx, txState)).toBe('success')
  })

  it('returns undefined for transaction after active in multi-step flow', () => {
    const deployTx = createTransaction({ id: 'deploy' })
    const changeTx = createTransaction({ id: 'change' })
    const transactions = [deployTx, changeTx]
    const txState = createTxState({
      txId: 'deploy',
      machineState: 'submitting',
    })
    expect(getStatus(transactions, changeTx, txState)).toBeUndefined()
  })
})
