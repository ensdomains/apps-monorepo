import { describe, expect, it } from 'vitest'
import {
  getPrimaryNameCandidates,
  getPrimaryNamePage,
  isConfirmationForSelection,
  isConfirmBlocked,
  needsPrimaryNameConfirmation,
} from './ChoosePrimaryNameDialog.handlers'

describe('getPrimaryNamePage', () => {
  const domains = Array.from({ length: 12 }, (_, index) => ({
    id: `${index}`,
    name: `name-${index}.eth`,
  }))

  it('returns eight names per page with an accurate final-page range', () => {
    expect(
      getPrimaryNamePage(domains, { searchQuery: '', page: 1 }),
    ).toMatchObject({
      domains: domains.slice(0, 8),
      total: 12,
      totalPages: 2,
      currentPage: 1,
      rangeStart: 1,
      rangeEnd: 8,
    })
    expect(
      getPrimaryNamePage(domains, { searchQuery: '', page: 2 }),
    ).toMatchObject({
      domains: domains.slice(8),
      total: 12,
      totalPages: 2,
      currentPage: 2,
      rangeStart: 9,
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
    ).toEqual([domains[11], ...domains.slice(0, 7)])
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
const THIRD_PARTY = '0x1111111111111111111111111111111111111111'

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

describe('primary-name confirmation', () => {
  const confirmation = {
    kind: 'update-eth-address',
    existingEthAddress: null,
    name: 'ensv2sg.eth',
    ownerAddress: OLD_OWNER,
  } as const

  it('shows the warning before an address write, but not for an already matching address', () => {
    expect(
      needsPrimaryNameConfirmation({
        kind: 'update-eth-address',
        existingEthAddress: null,
      }),
    ).toBe(true)
    expect(
      needsPrimaryNameConfirmation({
        kind: 'setup-resolver',
        existingEthAddress: null,
      }),
    ).toBe(true)
    expect(needsPrimaryNameConfirmation({ kind: 'ready' })).toBe(false)
    expect(
      needsPrimaryNameConfirmation(
        { kind: 'update-eth-address', existingEthAddress: null },
        confirmation,
      ),
    ).toBe(false)
  })

  it('asks again if the live address or required resolver action changes', () => {
    expect(
      needsPrimaryNameConfirmation(
        { kind: 'update-eth-address', existingEthAddress: THIRD_PARTY },
        confirmation,
      ),
    ).toBe(true)
    expect(
      needsPrimaryNameConfirmation(
        { kind: 'setup-resolver', existingEthAddress: null },
        confirmation,
      ),
    ).toBe(true)
  })

  it('rejects confirmation for another selected name or wallet', () => {
    expect(
      isConfirmationForSelection(confirmation, 'ensv2sg.eth', OLD_OWNER),
    ).toBe(true)
    expect(
      isConfirmationForSelection(confirmation, 'another.eth', OLD_OWNER),
    ).toBe(false)
    expect(
      isConfirmationForSelection(confirmation, 'ensv2sg.eth', THIRD_PARTY),
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
