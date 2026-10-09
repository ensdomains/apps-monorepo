import { describe, expect, it } from 'vitest'
import type { TransactionRequest } from '../types/transaction.types'
import { toPersistableRequest } from './persistableRequest'

const rhinestoneRequest = (
  onIntentSubmitted?: (intentId: bigint) => void,
): TransactionRequest =>
  ({
    type: 'rhinestone-intent',
    chainId: 11155111,
    rhinestoneParams: {
      calls: [{ to: '0x1', data: '0x', value: 0n }],
      ...(onIntentSubmitted ? { onIntentSubmitted } : {}),
    },
  }) as unknown as TransactionRequest

describe('toPersistableRequest', () => {
  // IndexedDB clones what it stores, and a function cannot be cloned: with the
  // observer left on, every save and the final archive throw, so the record
  // never reaches a stored terminal state.
  it('drops the intent observer', () => {
    const persistable = toPersistableRequest(rhinestoneRequest(() => {}))

    expect(structuredClone(persistable)).toBeDefined()
  })

  it('keeps the calls the record exists to remember', () => {
    const persistable = toPersistableRequest(rhinestoneRequest(() => {}))

    expect(persistable).toMatchObject({
      type: 'rhinestone-intent',
      rhinestoneParams: { calls: [{ to: '0x1' }] },
    })
  })

  it('leaves a request without an observer alone', () => {
    const request = rhinestoneRequest()

    expect(toPersistableRequest(request)).toEqual(request)
  })

  it('leaves an EOA request alone', () => {
    const request = {
      type: 'eoa',
      to: '0x1',
      data: '0x',
      chainId: 11155111,
    } as unknown as TransactionRequest

    expect(toPersistableRequest(request)).toBe(request)
  })

  it('has nothing to do without a request', () => {
    expect(toPersistableRequest(undefined)).toBeUndefined()
  })
})
