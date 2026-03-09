import { describe, expect, it } from 'vitest'
import type { ActiveTransactionState } from '../hooks/useActiveTransactionState'
import type { Transaction } from '../types'
import { getTransactionStatusInFlow } from './getTransactionStatusInFlow'

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

describe('getTransactionStatusInFlow', () => {
  const deployTx = createTransaction({ id: 'deploy' })
  const changeTx = createTransaction({ id: 'change' })
  const transactions = [deployTx, changeTx] as const

  it('returns undefined when txState is undefined', () => {
    expect(
      getTransactionStatusInFlow(transactions, deployTx, undefined),
    ).toBeUndefined()
    expect(
      getTransactionStatusInFlow(transactions, changeTx, undefined),
    ).toBeUndefined()
  })

  it('returns success for transactions before the active one', () => {
    const txState = createTxState({
      txId: 'change',
      machineState: 'submitting',
    })
    expect(getTransactionStatusInFlow(transactions, deployTx, txState)).toBe(
      'success',
    )
  })

  it('returns getTransactionStatus for the active transaction', () => {
    const txState = createTxState({
      txId: 'change',
      machineState: 'success',
    })
    expect(getTransactionStatusInFlow(transactions, changeTx, txState)).toBe(
      'success',
    )
  })

  it('returns undefined for transactions after the active one', () => {
    const txState = createTxState({
      txId: 'deploy',
      machineState: 'submitting',
    })
    expect(
      getTransactionStatusInFlow(transactions, changeTx, txState),
    ).toBeUndefined()
  })

  it('returns undefined when transaction is not in the list', () => {
    const txState = createTxState({ txId: 'deploy' })
    const unknownTx = createTransaction({ id: 'unknown' })
    expect(
      getTransactionStatusInFlow(transactions, unknownTx, txState),
    ).toBeUndefined()
  })

  it('returns error when active transaction has error', () => {
    const txState = createTxState({
      txId: 'change',
      machineState: 'submitting',
      error: new Error('Failed'),
    })
    expect(getTransactionStatusInFlow(transactions, changeTx, txState)).toBe(
      'error',
    )
  })
})
