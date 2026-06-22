import { describe, expect, it } from 'vitest'
import {
  createSponsorshipPredicate,
  parseSponsorshipChainIds,
} from './predicate'

describe('parseSponsorshipChainIds', () => {
  it('parses a comma-separated list into a set', () => {
    const ids = parseSponsorshipChainIds('1, 11155111')
    expect([...ids].sort((a, b) => a - b)).toEqual([1, 11155111])
  })

  it('drops blank, zero, negative and non-numeric entries', () => {
    expect([...parseSponsorshipChainIds(' ,abc,0,-1,8453')]).toEqual([8453])
  })

  it('returns an empty set for undefined or empty input (deny by default)', () => {
    expect(parseSponsorshipChainIds(undefined).size).toBe(0)
    expect(parseSponsorshipChainIds('').size).toBe(0)
  })
})

describe('createSponsorshipPredicate', () => {
  const makeEnv = (chains: string): CloudflareBindings =>
    ({
      RHINESTONE_SPONSORSHIP_CHAIN_IDS: chains,
    }) as unknown as CloudflareBindings

  it('allows an allowlisted chain and denies others', () => {
    const { chain } = createSponsorshipPredicate(makeEnv('1'))
    if (!chain) throw new Error('chain filter should be defined')
    expect(chain({ id: 1 })).toBe(true)
    expect(chain({ id: 8453 })).toBe(false)
  })

  it('stubs account and calls to true (real gating is FET-3337)', () => {
    const { account, calls } = createSponsorshipPredicate(makeEnv('1'))
    if (!account || !calls) throw new Error('stub filters should be defined')
    expect(account('0x0000000000000000000000000000000000000000')).toBe(true)
    expect(calls([])).toBe(true)
  })
})
