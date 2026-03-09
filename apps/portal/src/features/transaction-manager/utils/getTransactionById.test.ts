import { describe, expect, it } from 'vitest'
import type { ActiveTransactionState } from '../hooks/useActiveTransactionState'
import type { Transaction } from '../types'
import { getActiveTransaction, getTransactionById } from './getTransactionById'

const createTransaction = (
  overrides: Partial<Transaction> = {},
): Transaction => ({
  id: 'tx-1',
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
  txId: 'tx-1',
  machineState: 'submitting',
  hash: undefined,
  error: undefined,
  ...overrides,
})

describe('getActiveTransaction', () => {
  it('returns transaction matching txState when txState is present', () => {
    const deployTx = createTransaction({ id: 'deploy' })
    const changeTx = createTransaction({ id: 'change' })
    const transactions = [deployTx, changeTx]
    const txState = createTxState({ txId: 'change' })
    expect(getActiveTransaction(transactions, txState)).toBe(changeTx)
  })

  it('returns first transaction when txState is undefined', () => {
    const deployTx = createTransaction({ id: 'deploy' })
    const changeTx = createTransaction({ id: 'change' })
    const transactions = [deployTx, changeTx]
    expect(getActiveTransaction(transactions, undefined)).toBe(deployTx)
  })

  it('returns undefined when txState is undefined and transactions is empty', () => {
    expect(getActiveTransaction([], undefined)).toBeUndefined()
  })
})

describe('getTransactionById', () => {
  it('returns the transaction when id matches', () => {
    const transactions = [
      createTransaction({ id: 'save-records' }),
      createTransaction({ id: 'other-tx' }),
    ]
    const result = getTransactionById(transactions, 'save-records')
    expect(result).toEqual(transactions[0])
    expect(result.id).toBe('save-records')
  })

  it('returns the first matching transaction when duplicates exist', () => {
    const first = createTransaction({ id: 'tx-a', title: 'First' })
    const transactions = [
      first,
      createTransaction({ id: 'tx-a', title: 'Duplicate' }),
    ]
    const result = getTransactionById(transactions, 'tx-a')
    expect(result).toBe(first)
  })

  it('throws when transaction id is not found', () => {
    const transactions = [createTransaction({ id: 'tx-1' })]
    expect(() => getTransactionById(transactions, 'nonexistent')).toThrow(
      'Transaction with id nonexistent not found',
    )
  })

  it('throws when transactions array is empty', () => {
    expect(() => getTransactionById([], 'any-id')).toThrow(
      'Transaction with id any-id not found',
    )
  })
})
