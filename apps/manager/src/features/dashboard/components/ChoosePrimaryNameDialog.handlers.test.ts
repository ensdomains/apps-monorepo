import { describe, expect, it } from 'vitest'
import type { ProfileRecordsResult } from '@/features/profile/service/profileRecords'
import {
  getEthAddressFromRecords,
  getPrimaryNameCandidates,
  getPrimaryNamePage,
  hasMatchingEthAddress,
  isConfirmBlocked,
  recordsForPrimaryNameResolver,
  shouldUpdateEthAddress,
} from './ChoosePrimaryNameDialog.handlers'

describe('getPrimaryNamePage', () => {
  const domains = Array.from({ length: 12 }, (_, index) => ({
    id: `${index}`,
    name: `name-${index}.eth`,
  }))

  it('returns five names per page with an accurate final-page range', () => {
    expect(
      getPrimaryNamePage(domains, { searchQuery: '', page: 1 }),
    ).toMatchObject({
      domains: domains.slice(0, 5),
      total: 12,
      totalPages: 3,
      currentPage: 1,
      rangeStart: 1,
      rangeEnd: 5,
    })
    expect(
      getPrimaryNamePage(domains, { searchQuery: '', page: 3 }),
    ).toMatchObject({
      domains: domains.slice(10),
      total: 12,
      totalPages: 3,
      currentPage: 3,
      rangeStart: 11,
      rangeEnd: 12,
    })
  })

  it('searches the full list before paginating and clamps stale page numbers', () => {
    expect(
      getPrimaryNamePage(domains, { searchQuery: '  NAME-11  ', page: 3 }),
    ).toMatchObject({
      domains: [domains[11]],
      total: 1,
      totalPages: 1,
      currentPage: 1,
      rangeStart: 1,
      rangeEnd: 1,
    })
  })

  it('accepts decomposed Unicode search without changing the candidate name', () => {
    const unicode = { id: 'café.eth', name: 'café.eth' }
    expect(
      getPrimaryNamePage([unicode], { searchQuery: 'CAFE\u0301', page: 1 })
        .domains,
    ).toEqual([unicode])
  })

  it('puts the current primary name first before taking the page', () => {
    expect(
      getPrimaryNamePage(domains, {
        searchQuery: '',
        page: 1,
        reverseName: 'name-11.eth',
      }).domains,
    ).toEqual([domains[11], ...domains.slice(0, 4)])
  })

  it('returns a zero range for an empty search result', () => {
    expect(
      getPrimaryNamePage(domains, { searchQuery: 'missing', page: 3 }),
    ).toMatchObject({
      domains: [],
      total: 0,
      totalPages: 1,
      currentPage: 1,
      rangeStart: 0,
      rangeEnd: 0,
    })
  })
})

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

describe('getPrimaryNameCandidates', () => {
  it('hides raw noncanonical names even when the indexer supplies a canonical twin', () => {
    const canonical = {
      id: 'alice.eth',
      name: 'alice.eth',
      normalizedName: 'alice.eth',
    }
    const unicode = { id: 'café.eth', name: 'café.eth' }
    expect(
      getPrimaryNameCandidates([
        { id: 'ALICE.eth', name: 'ALICE.eth', normalizedName: 'alice.eth' },
        {
          id: 'cafe\u0301.eth',
          name: 'cafe\u0301.eth',
          normalizedName: 'café.eth',
        },
        { id: 'bad..eth', name: 'bad..eth' },
        { id: 'unknown-label' },
        { id: 'ALICE.eth', name: null, normalizedName: 'alice.eth' },
        { id: 'unknown-label', name: null, normalizedName: 'alice.eth' },
        canonical,
        unicode,
      ]),
    ).toEqual([canonical, unicode])
  })
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

describe('recordsForPrimaryNameResolver', () => {
  it('keeps existing text, non-ETH addresses, and metadata while setting the owner ETH address', () => {
    expect(
      recordsForPrimaryNameResolver(
        {
          texts: [
            { key: 'name', value: 'Yoginth' },
            { key: 'description', value: 'Yoginths' },
          ],
          coins: [
            { coinType: 60, value: THIRD_PARTY },
            { coinType: 0, value: 'bc1qexample' },
          ],
          contentHash: 'ipfs://example',
          abi: '[]',
        },
        OLD_OWNER,
      ),
    ).toEqual({
      texts: [
        { key: 'name', value: 'Yoginth' },
        { key: 'description', value: 'Yoginths' },
      ],
      coins: [
        { coinType: 0, value: 'bc1qexample' },
        { coinType: 60, value: OLD_OWNER },
      ],
      contentHash: 'ipfs://example',
      abi: '[]',
    })
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

describe('WEB-1256 cached address notice predicate', () => {
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
    // Mirrors the notice condition. Submission uses fresh chain reads.
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
    ['the selected name is not canonical', { selectedName: 'ALICE.eth' }],
  ])('blocks confirm while %s', (_, override) => {
    expect(isConfirmBlocked({ ...ready, ...override })).toBe(true)
  })
})
