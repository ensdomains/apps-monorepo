import { describe, expect, it } from 'vitest'
import {
  canReadStateForSubmittedBatch,
  type SubmittedBatchLookup,
} from './submittedBatchLookup'

describe('canReadStateForSubmittedBatch', () => {
  it.each<[string, SubmittedBatchLookup, boolean]>([
    ['dropped by the node', { status: 'not-found' }, true],
    ['lookup failed', { status: 'unavailable' }, false],
    ['mined but receipt missing', { status: 'mined' }, true],
    [
      'still pending',
      { status: 'pending', nonce: 4n, confirmedNonce: 4n },
      false,
    ],
    [
      'replaced at its nonce',
      { status: 'pending', nonce: 4n, confirmedNonce: 5n },
      true,
    ],
  ])('%s', (_, lookup, expected) => {
    expect(canReadStateForSubmittedBatch(lookup)).toBe(expected)
  })
})
