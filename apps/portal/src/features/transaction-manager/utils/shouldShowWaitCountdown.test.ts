import type { TransactionMachineActor } from '@ens-apps/transaction-manager'
import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types'
import { shouldShowWaitCountdown } from './shouldShowWaitCountdown'

const createMockActor = (value: string): TransactionMachineActor =>
  ({
    getSnapshot: () => ({
      value,
      context: {},
      matches: (state: string) => value === state,
    }),
  }) as TransactionMachineActor

const tx = (id: string, waitUntil?: number): Transaction => ({
  id,
  title: id,
  transactionName: id,
  onStart: () => {},
  onDone: () => {},
  waitUntil,
})

describe('shouldShowWaitCountdown', () => {
  it('shows the countdown while an earlier step is still in progress', () => {
    // The reveal window runs from the commit. Hiding it until the approve
    // landed made the countdown appear partway through.
    const register = tx('register', Date.now() + 60_000)
    const map = new Map<string, TransactionMachineActor>([
      ['commit', createMockActor('success')],
      ['approve', createMockActor('pending')],
    ])

    expect(shouldShowWaitCountdown(register, map)).toBe(true)
  })

  it('shows the countdown when no earlier step ran in this session', () => {
    // A resumed run's earlier steps happened before the reload.
    const register = tx('register', Date.now() + 60_000)

    expect(shouldShowWaitCountdown(register, new Map())).toBe(true)
  })

  it('hides the countdown once the step itself has started', () => {
    const register = tx('register', Date.now() + 60_000)
    const map = new Map<string, TransactionMachineActor>([
      ['register', createMockActor('pending')],
    ])

    expect(shouldShowWaitCountdown(register, map)).toBe(false)
  })

  it('hides the countdown once the wait is over, or when there is none', () => {
    expect(
      shouldShowWaitCountdown(tx('register', Date.now() - 1), new Map()),
    ).toBe(false)
    expect(shouldShowWaitCountdown(tx('register'), new Map())).toBe(false)
  })
})
