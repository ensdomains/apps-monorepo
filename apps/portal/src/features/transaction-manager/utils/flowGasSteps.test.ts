import { describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../types'
import {
  parseUnpaidStepKey,
  prepareUnpaidStepRequests,
  priceStepGas,
  unpaidStepKey,
} from './flowGasSteps'

const CHAIN_ID = 11155111
const FROM = '0x1111111111111111111111111111111111111111' as const
const TO = '0x2222222222222222222222222222222222222222' as const

const step = (id: string, intent?: Transaction['intent']): Transaction => ({
  id,
  title: id,
  transactionName: id,
  onDone: () => {},
  onStart: () => {},
  ...(intent ? { intent } : {}),
})

const eoaIntent = (
  prepare: Transaction['intent'] extends undefined
    ? never
    : NonNullable<Transaction['intent']>['prepare'],
) => ({ prepare }) as NonNullable<Transaction['intent']>

const walletClient = {
  account: { address: FROM },
  chain: { id: CHAIN_ID },
} as never

describe('unpaidStepKey', () => {
  it('keeps only the steps that still have to be paid for', () => {
    const settled = new Set(['approve'])
    expect(
      unpaidStepKey([step('approve'), step('commit'), step('register')], (id) =>
        settled.has(id),
      ),
    ).toBe('commit|register')
  })

  it('is empty when every step has settled', () => {
    expect(unpaidStepKey([step('a')], () => true)).toBe('')
  })

  it('changes when a step settles, which is what re-runs the encoding', () => {
    const steps = [step('a'), step('b')]
    const before = unpaidStepKey(steps, () => false)
    const after = unpaidStepKey(steps, (id) => id === 'a')
    expect(before).not.toBe(after)
  })
})

describe('parseUnpaidStepKey', () => {
  it('round-trips a key', () => {
    expect([...parseUnpaidStepKey('commit|register')]).toEqual([
      'commit',
      'register',
    ])
  })

  it('reads an empty key as no pending steps, not as one blank id', () => {
    expect(parseUnpaidStepKey('').size).toBe(0)
  })
})

describe('prepareUnpaidStepRequests', () => {
  const request = {
    type: 'eoa',
    chainId: CHAIN_ID,
    from: FROM,
    to: TO,
    data: '0xabcd',
  }

  it('encodes only the unpaid steps', () => {
    const prepare = vi.fn(() => ({ request }) as never)
    const result = prepareUnpaidStepRequests({
      transactions: [
        step('paid', eoaIntent(prepare)),
        step('unpaid', eoaIntent(prepare)),
      ],
      unpaidIds: new Set(['unpaid']),
      walletClient,
      chainId: CHAIN_ID,
    })
    expect(result).toHaveLength(1)
    expect(prepare).toHaveBeenCalledTimes(1)
  })

  it('yields undefined without a ready wallet rather than throwing', () => {
    const result = prepareUnpaidStepRequests({
      transactions: [
        step(
          'a',
          eoaIntent(() => ({ request }) as never),
        ),
      ],
      unpaidIds: new Set(['a']),
      walletClient: undefined,
      chainId: CHAIN_ID,
    })
    expect(result).toEqual([undefined])
  })

  it('swallows a builder throw, since the UI reaches those states legitimately', () => {
    const result = prepareUnpaidStepRequests({
      transactions: [
        step(
          'a',
          eoaIntent(() => {
            throw new Error('precondition not met')
          }),
        ),
      ],
      unpaidIds: new Set(['a']),
      walletClient,
      chainId: CHAIN_ID,
    })
    expect(result).toEqual([undefined])
  })

  it('yields undefined for a step with no intent at all', () => {
    // The registration commit step is exactly this: no intent until it runs.
    const result = prepareUnpaidStepRequests({
      transactions: [step('commit')],
      unpaidIds: new Set(['commit']),
      walletClient,
      chainId: CHAIN_ID,
    })
    expect(result).toEqual([undefined])
  })
})

describe('priceStepGas', () => {
  it('prices resolved gas at the fee ceiling', () => {
    expect(priceStepGas([21_000n, 50_000n], 2n)).toEqual([42_000n, 100_000n])
  })

  it('leaves an unresolved step null so the sum is marked incomplete', () => {
    expect(priceStepGas([21_000n, undefined], 2n)).toEqual([42_000n, null])
  })

  it('makes every step unknown when the fee has not resolved', () => {
    // Treating a missing fee as zero would read as a flow that costs nothing.
    expect(priceStepGas([21_000n, 50_000n], undefined)).toEqual([null, null])
  })
})
