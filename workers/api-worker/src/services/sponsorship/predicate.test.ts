import { toFunctionSelector } from 'viem'
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

  it('defaults to Sepolia when no chain ids are configured', () => {
    const { chain } = createSponsorshipPredicate(
      {} as unknown as CloudflareBindings,
    )
    if (!chain) throw new Error('chain filter should be defined')
    expect(chain({ id: 11155111 })).toBe(true)
    expect(chain({ id: 1 })).toBe(false)
  })

  it('keeps account permissive (sponsorship is gated per name, not caller)', () => {
    const { account } = createSponsorshipPredicate(makeEnv('1'))
    if (!account) throw new Error('account filter should be defined')
    expect(account('0x0000000000000000000000000000000000000000')).toBe(true)
  })

  it('calls: sponsors an allowlisted ENS call, denies a non-ENS contract', () => {
    const { calls } = createSponsorshipPredicate(makeEnv('11155111'))
    if (!calls) throw new Error('calls filter should be defined')

    // Empty intent: nothing to deny.
    expect(calls([])).toBe(true)

    // Allowlisted: setName on the Sepolia DefaultReverseRegistrar. Passed
    // lowercase to also exercise checksum-insensitive matching.
    const setName = toFunctionSelector('function setName(string name)')
    expect(
      calls([
        {
          to: '0xeb8269fb39290f31c4c29cec548807ca2133abb4',
          value: 0n,
          data: setName,
        },
      ]),
    ).toBe(true)

    // A non-ENS contract is denied even with an allowlisted selector.
    expect(
      calls([
        {
          to: '0x1111111111111111111111111111111111111111',
          value: 0n,
          data: setName,
        },
      ]),
    ).toBe(false)
  })

  it('calls: denies an allowlisted contract called with a non-allowlisted selector', () => {
    const { calls } = createSponsorshipPredicate(makeEnv('11155111'))
    if (!calls) throw new Error('calls filter should be defined')

    // transfer() is not in the sponsored set, even on an allowlisted contract.
    const transfer = toFunctionSelector(
      'function transfer(address to, uint256 amount)',
    )
    expect(
      calls([
        {
          to: '0xeb8269fb39290f31c4c29cec548807ca2133abb4',
          value: 0n,
          data: transfer,
        },
      ]),
    ).toBe(false)
  })

  it('calls: denies everything when no sponsorable chain has an allowlist', () => {
    // Mainnet (id 1) has no allowlist yet, so its calls are denied by default.
    const { calls } = createSponsorshipPredicate(makeEnv('1'))
    if (!calls) throw new Error('calls filter should be defined')
    const setName = toFunctionSelector('function setName(string name)')
    expect(
      calls([
        {
          to: '0xeb8269fb39290f31c4c29cec548807ca2133abb4',
          value: 0n,
          data: setName,
        },
      ]),
    ).toBe(false)
  })
})
