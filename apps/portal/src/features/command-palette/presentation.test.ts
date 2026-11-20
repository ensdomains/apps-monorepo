import { describe, expect, it } from 'vitest'
import type { UseSearchResultsReturn } from '@/features/dashboard/hooks/useSearchResults'
import { PALETTE_COMMANDS } from './catalog'
import type { PaletteFrame, PaletteScreen } from './core/state'
import {
  getEnabledCommands,
  getEntityQueryPolicy,
  getFailedSearchReads,
  getPaletteReadError,
  getSearchFeedback,
  getTitleParts,
  visibleSearchResults,
} from './presentation'

const makeFrame = (screen: PaletteScreen, query = ''): PaletteFrame => ({
  screen,
  query,
  selectedId: '',
  scrollTop: 0,
})

describe('getEntityQueryPolicy', () => {
  it.each([
    [
      { type: 'target', commandId: 'name.renew', target: 'name' },
      '',
      false,
      true,
    ],
    [
      { type: 'target', commandId: 'address.view', target: 'address' },
      '0x0000000000000000000000000000000000000001',
      true,
      false,
    ],
    [
      { type: 'entity', entity: { type: 'name', name: 'alice.eth' } },
      'bob.eth',
      false,
      false,
    ],
    [{ type: 'developer' }, 'alice.eth', false, false],
  ] as const)(
    'limits reads to the relevant %o interaction',
    (screen, query, isEnabled, shouldFetchOwnedNames) => {
      expect(
        getEntityQueryPolicy(
          makeFrame(screen, query),
          { chainId: 1, developerEnabled: true },
          PALETTE_COMMANDS,
        ),
      ).toEqual({ query, isEnabled, shouldFetchOwnedNames })
    },
  )

  it('does not let a developer-only alias suppress a normal name lookup', () => {
    expect(
      getEntityQueryPolicy(
        makeFrame({ type: 'root' }, 'migration'),
        { chainId: 1, developerEnabled: true },
        PALETTE_COMMANDS,
      ),
    ).toEqual({
      query: 'migration',
      isEnabled: true,
      shouldFetchOwnedNames: false,
    })
  })
})

describe('getEnabledCommands', () => {
  it('applies each tool gate while leaving normal commands available', () => {
    const commands = getEnabledCommands(PALETTE_COMMANDS, {
      timeTravel: false,
      migration: true,
      designQa: false,
    })
    const developerIds = commands
      .filter(({ operation }) => operation.type === 'developer')
      .map(({ id }) => id)
    expect(developerIds).toEqual(['developer.drawer', 'developer.migration'])
    expect(commands.find(({ id }) => id === 'name.renew')?.operation.type).toBe(
      'renew',
    )
  })
})

describe('visibleSearchResults', () => {
  it('preserves current-query candidates and verification while presenting search results', () => {
    const suggestion = {
      id: 'name:alice.eth',
      inputValue: 'alice.eth',
      label: 'alice.eth',
      description: 'View name',
      action: () => {},
    }
    const data: UseSearchResultsReturn = {
      suggestions: [suggestion],
      ownerBySuggestionId: new Map(),
      offchainNameIds: new Set(),
      failedOwnerIds: new Set(),
      failedAvailabilityIds: new Set(),
      failedRecordsIds: new Set(),
      nameVerificationBySuggestionId: new Map(),
      availableNames: [suggestion],
      pendingAvailabilityIds: new Set(),
      ownedNamesFiltered: [{ name: 'old.eth' }],
      ownedNameSuggestions: [],
      isOwnedNamesLoading: false,
      hasOwnedNamesError: false,
      allItems: [{ type: 'suggestion', value: suggestion.id, suggestion }],
      isTldsLoading: false,
      hasAnySection: true,
      searchNotice: 'Old query warning',
    }
    expect(visibleSearchResults(data, 'alice.eth', false)).toBe(data)
    const failed = { ...data, failedAvailabilityIds: new Set([suggestion.id]) }
    expect(getFailedSearchReads(failed)).toEqual([
      { name: 'alice.eth', source: 'availability' },
    ])
    expect(getSearchFeedback(failed, false, true)).toEqual({
      hasReadFailure: false,
      isSearching: false,
    })
    expect(getSearchFeedback(failed, true, false)).toEqual({
      hasReadFailure: true,
      isSearching: false,
    })
    expect(
      getSearchFeedback(
        { ...data, pendingAvailabilityIds: new Set([suggestion.id]) },
        true,
        false,
      ),
    ).toEqual({ hasReadFailure: false, isSearching: true })
    expect(getSearchFeedback(data, true, true)).toEqual({
      hasReadFailure: false,
      isSearching: true,
    })
  })
})

describe('getTitleParts', () => {
  it.each([
    ['Renew name', 're', { before: '', match: 'Re', after: 'new name' }],
    [
      'Edit records',
      'records',
      { before: 'Edit ', match: 'records', after: '' },
    ],
    ['Copy name', 'website', { before: 'Copy name', match: '', after: '' }],
    ['Copy name', '  ', { before: 'Copy name', match: '', after: '' }],
    ['İstanbul', 'stan', { before: 'İstanbul', match: '', after: '' }],
  ])('splits %s around %j', (title, query, parts) => {
    expect(getTitleParts(title, query)).toEqual(parts)
  })
})

it.each([
  [
    true,
    true,
    true,
    'Could not load some relationships. Retry or open the entity to continue.',
  ],
  [
    true,
    false,
    true,
    'Could not verify some name information. You can retry the lookup.',
  ],
  [
    false,
    false,
    true,
    'Could not load your names. You can still search any name.',
  ],
  [false, false, false, undefined],
] as const)(
  'prioritizes active query recovery messages',
  (hasSearchError, hasRelationshipError, hasPortfolioError, expected) => {
    expect(
      getPaletteReadError({
        hasSearchError,
        hasRelationshipError,
        hasPortfolioError,
      }),
    ).toBe(expected)
  },
)
