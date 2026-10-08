import { describe, expect, it } from 'vitest'
import { toDisplayState } from './useCheckAvailability'

const eth2ld = {
  type: 'eth-2ld' as const,
  name: 'bob.eth',
  label: 'bob',
}

describe('toDisplayState', () => {
  it('shows searching when the outcome is for a previous name', () => {
    expect(
      toDisplayState({
        trimmedInput: 'bob.eth',
        parsedInput: { type: 'name', value: 'bob.eth' },
        instantName: 'bob.eth',
        instantKind: eth2ld,
        isDebouncing: false,
        outcome: { type: 'owned', name: 'alice.eth' },
      }),
    ).toEqual({ type: 'searching', domainName: 'bob.eth' })
  })

  it('shows searching while the input is still debouncing', () => {
    expect(
      toDisplayState({
        trimmedInput: 'bob.eth',
        parsedInput: { type: 'name', value: 'bob.eth' },
        instantName: 'bob.eth',
        instantKind: eth2ld,
        isDebouncing: true,
        outcome: { type: 'owned', name: 'bob.eth' },
      }),
    ).toEqual({ type: 'searching', domainName: 'bob.eth' })
  })

  it('maps an owned outcome to unavailable once the name matches', () => {
    expect(
      toDisplayState({
        trimmedInput: 'bob.eth',
        parsedInput: { type: 'name', value: 'bob.eth' },
        instantName: 'bob.eth',
        instantKind: eth2ld,
        isDebouncing: false,
        outcome: { type: 'owned', name: 'bob.eth' },
      }),
    ).toEqual({ type: 'unavailable', domainName: 'bob.eth' })
  })

  it('maps a not-imported DNS outcome to not-imported', () => {
    expect(
      toDisplayState({
        trimmedInput: 'vitalik.xyz',
        parsedInput: { type: 'name', value: 'vitalik.xyz' },
        instantName: 'vitalik.xyz',
        instantKind: {
          type: 'dns-name',
          name: 'vitalik.xyz',
          isSubname: false,
        },
        isDebouncing: false,
        outcome: { type: 'not-imported', name: 'vitalik.xyz' },
      }),
    ).toEqual({ type: 'not-imported', domainName: 'vitalik.xyz' })
  })
})
