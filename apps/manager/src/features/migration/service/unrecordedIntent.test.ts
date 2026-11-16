import { describe, expect, it } from 'vitest'
import {
  canReadStateForUnrecordedIntent,
  mayLeaveWalletPromptOpen,
  type UnrecordedIntentEvidence,
} from './unrecordedIntent'

describe('canReadStateForUnrecordedIntent', () => {
  it.each<[UnrecordedIntentEvidence, boolean]>([
    [{ lease: 'free', wallet: 'idle' }, true],
    [{ lease: 'unsupported', wallet: 'idle' }, true],
    [{ lease: 'held', wallet: 'idle' }, false],
    [{ lease: 'free', wallet: 'pending' }, false],
    [{ lease: 'free', wallet: 'unknown' }, false],
  ])('%j -> %s', (evidence, expected) => {
    expect(canReadStateForUnrecordedIntent(evidence)).toBe(expected)
  })
})

describe('mayLeaveWalletPromptOpen', () => {
  it.each<[string, unknown, boolean]>([
    ['a stopped actor', { _tag: 'TransactionStoppedError' }, true],
    ['a settled wallet error', { _tag: 'TransactionSubmissionError' }, false],
    ['a plain error', new Error('rejected'), false],
    ['not an object', 'closed', false],
  ])('%s', (_, error, expected) => {
    expect(mayLeaveWalletPromptOpen(error)).toBe(expected)
  })
})
