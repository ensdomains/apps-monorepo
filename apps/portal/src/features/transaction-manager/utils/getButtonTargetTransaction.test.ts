import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types'
import { getButtonTargetTransaction } from './getButtonTargetTransaction'

const createTransaction = (
  overrides: Partial<Transaction> = {},
): Transaction => ({
  id: 'tx-1',
  title: 'Submit commitment',
  transactionName: 'Commit to register name.eth',
  onStart: () => {},
  onDone: () => {},
  ...overrides,
})

describe('getButtonTargetTransaction', () => {
  const commit = createTransaction({ id: 'commit' })
  const register = createTransaction({ id: 'register' })
  const transactions = [commit, register]

  it('returns the next step once the active one has succeeded', () => {
    expect(getButtonTargetTransaction(transactions, 0, 'success')).toBe(
      register,
    )
  })

  it('returns the active step while it has not succeeded', () => {
    expect(getButtonTargetTransaction(transactions, 0, undefined)).toBe(commit)
    expect(getButtonTargetTransaction(transactions, 0, 'error')).toBe(commit)
    expect(getButtonTargetTransaction(transactions, 0, 'pending')).toBe(commit)
  })

  it('returns undefined when the last step has succeeded', () => {
    expect(
      getButtonTargetTransaction(transactions, 1, 'success'),
    ).toBeUndefined()
  })
})
