import type { EOATransactionRequest } from '@ens-apps/transaction-manager'
import { describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../types'
import { prepareUnpaidStepRequests } from './flowGasSteps'

const CHAIN_ID = 11155111
const FROM = '0x1111111111111111111111111111111111111111' as const
const TO = '0x2222222222222222222222222222222222222222' as const

const eoaRequest = {
  type: 'eoa',
  chainId: CHAIN_ID,
  from: FROM,
  to: TO,
  data: '0xabcd',
} as EOATransactionRequest

const step = (id: string, intent?: Transaction['intent']): Transaction => ({
  id,
  title: id,
  transactionName: id,
  onDone: () => {},
  onStart: () => {},
  ...(intent ? { intent } : {}),
})

const walletClient = {
  account: { address: FROM },
  chain: { id: CHAIN_ID },
} as never

const run = (
  transactions: readonly Transaction[],
  overrides: Partial<Parameters<typeof prepareUnpaidStepRequests>[0]> = {},
) =>
  prepareUnpaidStepRequests({
    transactions,
    isSettled: () => false,
    activeRequestFor: () => undefined,
    walletClient,
    chainId: CHAIN_ID,
    ...overrides,
  })

describe('prepareUnpaidStepRequests', () => {
  it('skips steps that have already settled', () => {
    const result = run([step('paid'), step('unpaid')], {
      isSettled: (id) => id === 'paid',
    })
    expect(result).toHaveLength(1)
  })

  it('yields undefined for a step with no intent, rather than dropping it', () => {
    // The registration commit step is exactly this, and it has to keep its slot
    // so the sum is marked incomplete rather than looking cheap.
    expect(run([step('commit')])).toEqual([
      { request: undefined, started: false },
    ])
  })

  it('swallows a builder throw instead of failing the whole verdict', () => {
    const result = run([
      step('a', {
        prepare: () => {
          throw new Error('precondition not met')
        },
      }),
    ])
    expect(result).toEqual([{ request: undefined, started: false }])
  })

  it('yields undefined without a ready wallet', () => {
    const prepare = vi.fn(() => ({ request: eoaRequest }) as never)
    expect(run([step('a', { prepare })], { walletClient: undefined })).toEqual([
      { request: undefined, started: false },
    ])
    expect(prepare).not.toHaveBeenCalled()
  })

  // Matches the key the step's own row uses, so it is estimated once.
  it('prefers the request the machine holds once a step has started', () => {
    const prepare = vi.fn(() => ({ request: eoaRequest }) as never)
    const active = { ...eoaRequest, data: '0xbeef' } as EOATransactionRequest
    const result = run([step('a', { prepare })], {
      activeRequestFor: () => active,
    })
    expect(result).toEqual([{ request: active, started: true }])
    expect(prepare).not.toHaveBeenCalled()
  })
})
