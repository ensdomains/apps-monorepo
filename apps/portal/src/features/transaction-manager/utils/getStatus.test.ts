import type { TransactionMachineActor } from '@ens-apps/transaction-manager'
import { describe, expect, it } from 'vitest'
import { getStatus } from './getStatus'

const createMockActor = (
  value: string | Record<string, string>,
  error?: Error,
): TransactionMachineActor =>
  ({
    getSnapshot: () => ({
      value,
      context: { error },
      matches: (state: string) =>
        typeof value === 'string' ? value === state : state in value,
    }),
  }) as TransactionMachineActor

describe('getStatus', () => {
  it('returns status from actor when transaction exists in map', () => {
    const map = new Map<string, TransactionMachineActor>([
      ['tx-1', createMockActor('success')],
    ])
    expect(getStatus('tx-1', map)).toBe('success')
  })

  it('returns error when the actor is in an error state', () => {
    const map = new Map<string, TransactionMachineActor>([
      ['tx-1', createMockActor({ error: 'submission' }, new Error('Failed'))],
    ])
    expect(getStatus('tx-1', map)).toBe('error')
  })

  it('reports an auto-retry as in flight, not failed', () => {
    const map = new Map<string, TransactionMachineActor>([
      ['tx-1', createMockActor('retrying', new Error('Failed'))],
    ])
    expect(getStatus('tx-1', map)).toBe('retrying')
  })

  it('returns undefined when transaction not in map', () => {
    const map = new Map<string, TransactionMachineActor>([
      ['tx-1', createMockActor('success')],
    ])
    expect(getStatus('tx-2', map)).toBeUndefined()
  })

  it('returns undefined when map is undefined', () => {
    expect(getStatus('tx-1', new Map())).toBeUndefined()
  })
})
