import { describe, expect, it } from 'vitest'
import type { ProfileRecordsResult } from '@/features/profile/service/profileRecords'
import {
  getEthAddressFromRecords,
  hasMatchingEthAddress,
  isConfirmBlocked,
  shouldUpdateEthAddress,
} from './ChoosePrimaryNameDialog.handlers'

/** The wallet in the WEB-1256 repro, which transferred the name away. */
const OLD_OWNER = '0x55e55C649895940826a852820d9e1A076Ec47b09'
const NEW_OWNER = '0xFc5958B4B6F9a06D21E06429c8833f865577acf0'
const THIRD_PARTY = '0x1111111111111111111111111111111111111111'

const recordsWithEthAddress = (value: string): ProfileRecordsResult => ({
  texts: [],
  coins: [{ coinType: 60, value }],
})

const recordsWithoutEthAddress = (): ProfileRecordsResult => ({
  texts: [],
  coins: [{ coinType: 0, value: 'bc1qexample' }],
})

describe('getEthAddressFromRecords', () => {
  it('reads the coin-60 record', () => {
    expect(getEthAddressFromRecords(recordsWithEthAddress(OLD_OWNER))).toBe(
      OLD_OWNER,
    )
  })

  it('is undefined when no coin-60 record exists', () => {
    expect(getEthAddressFromRecords(recordsWithoutEthAddress())).toBeUndefined()
  })

  it('is undefined when the records are missing', () => {
    expect(getEthAddressFromRecords(undefined)).toBeUndefined()
  })
})

describe('hasMatchingEthAddress', () => {
  it('matches regardless of checksum casing', () => {
    expect(
      hasMatchingEthAddress(
        recordsWithEthAddress(OLD_OWNER.toLowerCase()),
        OLD_OWNER.toUpperCase(),
      ),
    ).toBe(true)
  })

  it('does not match a different wallet', () => {
    expect(
      hasMatchingEthAddress(recordsWithEthAddress(NEW_OWNER), OLD_OWNER),
    ).toBe(false)
  })

  it('does not match when the wallet is unknown', () => {
    expect(
      hasMatchingEthAddress(recordsWithEthAddress(OLD_OWNER), undefined),
    ).toBe(false)
  })
})

describe('shouldUpdateEthAddress', () => {
  it('is false when the record already points at the connected wallet', () => {
    expect(
      shouldUpdateEthAddress({
        selectedName: 'ensv2sg.eth',
        recordsSettled: true,
        selectedNameRecords: recordsWithEthAddress(OLD_OWNER),
        ownerAddress: OLD_OWNER,
      }),
    ).toBe(false)
  })

  it('is true when the record points somewhere else', () => {
    expect(
      shouldUpdateEthAddress({
        selectedName: 'ensv2sg.eth',
        recordsSettled: true,
        selectedNameRecords: recordsWithEthAddress(THIRD_PARTY),
        ownerAddress: OLD_OWNER,
      }),
    ).toBe(true)
  })

  it('is false until the records settle, so no branch is taken early', () => {
    expect(
      shouldUpdateEthAddress({
        selectedName: 'ensv2sg.eth',
        recordsSettled: false,
        selectedNameRecords: undefined,
        ownerAddress: OLD_OWNER,
      }),
    ).toBe(false)
  })

  it('is false with no name selected', () => {
    expect(
      shouldUpdateEthAddress({
        selectedName: null,
        recordsSettled: true,
        selectedNameRecords: undefined,
        ownerAddress: OLD_OWNER,
      }),
    ).toBe(false)
  })
})

describe('WEB-1256 end-to-end predicate matrix', () => {
  const decide = ({
    ethRecord,
    resolverBlocked,
    recordsSettled = true,
  }: {
    ethRecord: string | undefined
    resolverBlocked: boolean
    recordsSettled?: boolean
  }) => {
    const needsEthAddressUpdate = shouldUpdateEthAddress({
      selectedName: 'ensv2sg.eth',
      recordsSettled,
      selectedNameRecords: ethRecord
        ? recordsWithEthAddress(ethRecord)
        : recordsWithoutEthAddress(),
      ownerAddress: OLD_OWNER,
    })
    // Mirrors the component: `resolverBlocked && needsEthAddressUpdate`.
    return resolverBlocked && needsEthAddressUpdate
  }

  it('the repro: transferred away, resolver attached, record still ours', () => {
    expect(decide({ ethRecord: OLD_OWNER, resolverBlocked: true })).toBe(false)
  })

  it('a fresh name with no resolver still gets set up', () => {
    expect(decide({ ethRecord: undefined, resolverBlocked: true })).toBe(true)
  })

  it('a normal writable name never gets set up', () => {
    expect(decide({ ethRecord: OLD_OWNER, resolverBlocked: false })).toBe(false)
  })

  it('a failed records query does not masquerade as "no record"', () => {
    expect(
      decide({
        ethRecord: undefined,
        resolverBlocked: true,
        recordsSettled: false,
      }),
    ).toBe(false)
  })
})

describe('isConfirmBlocked', () => {
  const ready = {
    isSubmitting: false,
    isPreparing: false,
    resolverAccessSettled: true,
    recordsSettled: true,
    hasChanges: true,
    selectedName: 'ensv2sg.eth',
  }

  it('allows confirm once every input has settled', () => {
    expect(isConfirmBlocked(ready)).toBe(false)
  })

  it.each([
    ['a submission is in flight', { isSubmitting: true }],
    ['a preparation step is running', { isPreparing: true }],
    ['the resolver probe has not settled', { resolverAccessSettled: false }],
    ['the records have not settled', { recordsSettled: false }],
    ['nothing would change', { hasChanges: false }],
    ['no name is selected', { selectedName: null }],
  ])('blocks confirm while %s', (_, override) => {
    expect(isConfirmBlocked({ ...ready, ...override })).toBe(true)
  })
})
