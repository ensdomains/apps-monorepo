import { afterEach, describe, expect, it } from 'vitest'
import {
  clearL2FundingRecord,
  L2_FUNDING_STORAGE_KEY,
  type L2FundingRecord,
  readL2FundingRecord,
  writeL2FundingRecord,
} from './l2FundingPersistence'

const OWNER = '0x1111111111111111111111111111111111111111'
const NOW = 1_800_000_000_000
const record: L2FundingRecord = {
  owner: OWNER,
  sourceChainId: 84532,
  amountOut: 5_000_000n,
  amountIn: 5_012_573n,
  intentId: 2n ** 200n,
  balanceBefore: 1_000_000n,
  submittedAt: NOW,
}

describe('l2FundingPersistence', () => {
  afterEach(() => localStorage.clear())

  it('keeps the bridge for its owner, bigints intact', () => {
    writeL2FundingRecord(record)
    expect(readL2FundingRecord(OWNER, { now: NOW })).toEqual(record)
  })

  it('shows nothing to another wallet', () => {
    writeL2FundingRecord(record)
    expect(
      readL2FundingRecord('0x2222222222222222222222222222222222222222', {
        now: NOW,
      }),
    ).toBeNull()
  })

  it('drops a bridge older than a day', () => {
    writeL2FundingRecord(record)
    expect(
      readL2FundingRecord(OWNER, { now: NOW + 24 * 60 * 60 * 1000 + 1 }),
    ).toBeNull()
    expect(localStorage.getItem(L2_FUNDING_STORAGE_KEY)).toBeNull()
  })

  it('only clears the bridge it is asked to', () => {
    writeL2FundingRecord(record)
    clearL2FundingRecord(1n)
    expect(readL2FundingRecord(OWNER, { now: NOW })).toEqual(record)
    clearL2FundingRecord(record.intentId)
    expect(readL2FundingRecord(OWNER, { now: NOW })).toBeNull()
  })

  it('ignores a malformed record', () => {
    localStorage.setItem(L2_FUNDING_STORAGE_KEY, '{"owner":"nope"}')
    expect(readL2FundingRecord(OWNER, { now: NOW })).toBeNull()
  })
})
