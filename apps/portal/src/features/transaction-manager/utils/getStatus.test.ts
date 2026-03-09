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
  describe('single transaction', () => {
    it('returns machineState when txState and transaction ids match', () => {
      const txState = createTxState({
        txId: 'save-records',
        machineState: 'success',
      })
      const transaction = createTransaction({ id: 'save-records' })
      const transactions = [transaction]
      expect(getStatus(transactions, transaction, txState)).toBe('success')
    })

    it('returns undefined when ids do not match', () => {
      const txState = createTxState({ txId: 'other-tx' })
      const transaction = createTransaction({ id: 'save-records' })
      const transactions = [transaction]
      expect(getStatus(transactions, transaction, txState)).toBeUndefined()
    })
  })

  describe('multi-step flow', () => {
    const deployTx = createTransaction({ id: 'deploy' })
    const changeTx = createTransaction({ id: 'change' })
    const transactions = [deployTx, changeTx]

    it('returns undefined when txState is undefined', () => {
      expect(getStatus(transactions, deployTx, undefined)).toBeUndefined()
      expect(getStatus(transactions, changeTx, undefined)).toBeUndefined()
    })

    it('returns success for transactions before the active one', () => {
      const txState = createTxState({
        txId: 'change',
        machineState: 'submitting',
      })
      expect(getStatus(transactions, deployTx, txState)).toBe('success')
    })

    it('returns getTransactionStatus for the active transaction', () => {
      const txState = createTxState({
        txId: 'change',
        machineState: 'success',
      })
      expect(getStatus(transactions, changeTx, txState)).toBe('success')
    })

    it('returns undefined for transactions after the active one', () => {
      const txState = createTxState({
        txId: 'deploy',
        machineState: 'submitting',
      })
      expect(getStatus(transactions, changeTx, txState)).toBeUndefined()
    })

    it('returns undefined when transaction is not in the list', () => {
      const txState = createTxState({ txId: 'deploy' })
      const unknownTx = createTransaction({ id: 'unknown' })
      expect(getStatus(transactions, unknownTx, txState)).toBeUndefined()
    })

    it('returns error when active transaction has error', () => {
      const txState = createTxState({
        txId: 'change',
        machineState: 'submitting',
        error: new Error('Failed'),
      })
      expect(getStatus(transactions, changeTx, txState)).toBe('error')
    })
  })
})
