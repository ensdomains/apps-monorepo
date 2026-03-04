import { describe, expect, it } from 'vitest'
import type { ActiveTransactionState } from '../hooks/useActiveTransactionState'
import type { Transaction } from '../types'
import { getTransactionStatus } from './getTrasactionStatus'

const createTransaction = (
  overrides: Partial<Transaction> = {},
): Transaction => ({
  id: 'save-records',
  title: 'Save records',
  transactionName: 'Set resolver records',
  estimatedGasCost: 0.0001,
  onStart: () => {},
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

describe('getTransactionStatus', () => {
  it('returns machineState when txState and transaction ids match', () => {
    const txState = createTxState({
      txId: 'save-records',
      machineState: 'success',
    })
    const transaction = createTransaction({ id: 'save-records' })
    expect(getTransactionStatus(txState, transaction)).toBe('success')
  })

  it('returns undefined when txState id does not match transaction id', () => {
    const txState = createTxState({ txId: 'other-tx' })
    const transaction = createTransaction({ id: 'save-records' })
    expect(getTransactionStatus(txState, transaction)).toBeUndefined()
  })

  it('returns undefined when txState is undefined', () => {
    const transaction = createTransaction()
    expect(getTransactionStatus(undefined, transaction)).toBeUndefined()
  })

  it('returns undefined when transaction is undefined', () => {
    const txState = createTxState()
    expect(getTransactionStatus(txState, undefined)).toBeUndefined()
  })

  it('returns undefined when both txState and transaction are undefined', () => {
    expect(getTransactionStatus(undefined, undefined)).toBeUndefined()
  })

  it('returns nested error state when machineState is object', () => {
    const txState = createTxState({
      txId: 'save-records',
      machineState: { error: 'submission' },
    })
    const transaction = createTransaction({ id: 'save-records' })
    expect(getTransactionStatus(txState, transaction)).toEqual({
      error: 'submission',
    })
  })
})
