import { describe, expect, it } from 'vitest'
import {
  canReadStateForUnrecordedIntent,
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
