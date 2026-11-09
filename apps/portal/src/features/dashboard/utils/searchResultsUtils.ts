import { match, P } from 'ts-pattern'
import type { ProtocolVersion } from '@/utils/types'
import type { Suggestion } from './buildSearchSuggestions'

/**
 * Flat item for keyboard nav and selection: suggestions, then owned names.
 */
export const isSubname = (name: string) => name.split('.').length > 2

export type SearchResultItem =
  | {
      readonly type: 'suggestion'
      readonly value: string
      readonly suggestion: Suggestion
    }
  | { readonly type: 'register'; readonly value: string; readonly name: string }
  | { readonly type: 'owned'; readonly value: string; readonly name: string }

export type BuildSearchResultItemsParams = {
  readonly suggestions: readonly Suggestion[]
  readonly availableNames?: readonly Suggestion[]
  readonly ownedNamesFiltered: ReadonlyArray<{ name: string }>
}

/**
 * Builds the flat list of search result items in display order:
 * suggestions first, then owned names.
 */
export function buildSearchResultItems({
  suggestions,
  availableNames = [],
  ownedNamesFiltered,
}: BuildSearchResultItemsParams): SearchResultItem[] {
  return [
    ...suggestions.map(
      (suggestion): SearchResultItem => ({
        type: 'suggestion',
        value: suggestion.id,
        suggestion,
      }),
    ),
    ...availableNames.map(
      ({ inputValue }): SearchResultItem => ({
        type: 'register',
        value: `register:${inputValue}`,
        name: inputValue,
      }),
    ),
    ...ownedNamesFiltered.map(
      ({ name }): SearchResultItem => ({
        type: 'owned',
        value: `owned:${name}`,
        name,
      }),
    ),
  ]
}

export type SearchNameVerification =
  | {
      readonly status:
        | 'unchecked'
        | 'checking'
        | 'registered'
        | 'offchain'
        | 'available'
        | 'not-found'
    }
  | {
      readonly status: 'failed'
      readonly source: 'owner' | 'records' | 'availability'
    }

type InlineSearchSelectionParams = {
  readonly items: readonly SearchResultItem[]
  readonly selectedValue: string | null
  readonly verification: ReadonlyMap<string, SearchNameVerification>
}

const getSelectableSearchItems = ({
  items,
  verification,
}: InlineSearchSelectionParams) =>
  items.filter(
    (item) =>
      item.type !== 'suggestion' ||
      verification.get(item.value)?.status !== 'not-found',
  )

export const getInlineSearchSelection = (
  params: InlineSearchSelectionParams,
) => {
  const selectable = getSelectableSearchItems(params)
  return params.selectedValue === null
    ? selectable[0]
    : selectable.find(({ value }) => value === params.selectedValue)
}

type InlineSearchKeyAction =
  | { readonly type: 'ignore' | 'close' }
  | { readonly type: 'move' | 'select'; readonly value: string }

export const getInlineSearchKeyAction = ({
  key,
  isComposing,
  isCurrentQuery,
  ...selection
}: InlineSearchSelectionParams & {
  readonly key: string
  readonly isComposing: boolean
  readonly isCurrentQuery: boolean
}): InlineSearchKeyAction => {
  if (isComposing) return { type: 'ignore' }
  if (key === 'Escape') return { type: 'close' }
  if (!isCurrentQuery) return { type: 'ignore' }
  const selectable = getSelectableSearchItems(selection)
  const active = getInlineSearchSelection(selection)
  if (key === 'Enter')
    return active ? { type: 'select', value: active.value } : { type: 'ignore' }
  const direction = match(key)
    .with('ArrowDown', () => 1)
    .with('ArrowUp', () => -1)
    .otherwise(() => 0)
  if (!direction || selectable.length === 0) return { type: 'ignore' }
  const index = selectable.findIndex(({ value }) => value === active?.value)
  const nextIndex = match({ hasActive: index >= 0, direction })
    .with({ hasActive: false, direction: 1 }, () => 0)
    .with({ hasActive: false, direction: -1 }, () => selectable.length - 1)
    .otherwise(
      () => (index + direction + selectable.length) % selectable.length,
    )
  const next = selectable[nextIndex]
  return next ? { type: 'move', value: next.value } : { type: 'ignore' }
}

type SearchNameVerificationParams = {
  readonly isSubname: boolean
  readonly isEnabled: boolean
  readonly owner: 'pending' | 'failed' | 'absent' | 'present'
  readonly records: 'unchecked' | 'pending' | 'failed' | 'resolved' | 'empty'
  readonly availability:
    | 'unchecked'
    | 'pending'
    | 'failed'
    | 'available'
    | 'unavailable'
}

export const getSearchNameVerification = (
  params: SearchNameVerificationParams,
): SearchNameVerification =>
  match(params)
    .with(
      { availability: 'available' },
      () => ({ status: 'available' }) as const,
    )
    .with(
      { owner: 'failed' },
      () => ({ status: 'failed', source: 'owner' }) as const,
    )
    .with(
      { records: 'failed' },
      () => ({ status: 'failed', source: 'records' }) as const,
    )
    .with(
      { availability: 'failed' },
      () => ({ status: 'failed', source: 'availability' }) as const,
    )
    .with({ owner: 'present' }, () => ({ status: 'registered' }) as const)
    .with({ records: 'resolved' }, () => ({ status: 'offchain' }) as const)
    .with({ isEnabled: false }, () => ({ status: 'unchecked' }) as const)
    .with(
      P.union(
        { owner: 'pending' },
        { records: 'pending' },
        { availability: 'pending' },
      ),
      () => ({ status: 'checking' }) as const,
    )
    .with(
      { isSubname: true, owner: 'absent', records: 'empty' },
      () => ({ status: 'not-found' }) as const,
    )
    .otherwise(() => ({ status: 'unchecked' }) as const)

type SearchQuerySnapshot<T = unknown> = {
  readonly data?: T
  readonly isError: boolean
  readonly isPending: boolean
}

const getOwnerReadState = (query: SearchQuerySnapshot | undefined) =>
  match(query)
    .with({ isError: true }, () => 'failed' as const)
    .with(P.union(undefined, { data: undefined }), () => 'pending' as const)
    .with({ data: null }, () => 'absent' as const)
    .otherwise(() => 'present' as const)

const getRecordsReadState = (
  query: SearchQuerySnapshot | undefined,
  hasResolution: boolean,
) =>
  match(query)
    .with(undefined, () => 'unchecked' as const)
    .with({ isError: true }, () => 'failed' as const)
    .with({ isPending: true }, () => 'pending' as const)
    .otherwise(() =>
      hasResolution ? ('resolved' as const) : ('empty' as const),
    )

const getAvailabilityReadState = (
  query: SearchQuerySnapshot<{ readonly isAvailable: boolean }> | undefined,
) =>
  match(query)
    .with(undefined, () => 'unchecked' as const)
    .with({ isError: true }, () => 'failed' as const)
    .with({ data: undefined }, () => 'pending' as const)
    .with({ data: { isAvailable: true } }, () => 'available' as const)
    .otherwise(() => 'unavailable' as const)

export const getSearchNameVerificationFromQueries = ({
  name,
  isEnabled,
  owner,
  records,
  hasResolution,
  availability,
}: {
  readonly name: string
  readonly isEnabled: boolean
  readonly owner: SearchQuerySnapshot | undefined
  readonly records: SearchQuerySnapshot | undefined
  readonly hasResolution: boolean
  readonly availability:
    | SearchQuerySnapshot<{ readonly isAvailable: boolean }>
    | undefined
}): SearchNameVerification =>
  getSearchNameVerification({
    isSubname: isSubname(name),
    isEnabled,
    owner: getOwnerReadState(owner),
    records: getRecordsReadState(records, hasResolution),
    availability: getAvailabilityReadState(availability),
  })

export const getSearchOwnerData = <T>(
  query: SearchQuerySnapshot<T> | undefined,
  isRecordsUnresolved: boolean,
): T | undefined =>
  isRecordsUnresolved || query?.isError ? undefined : query?.data

export type SearchOwner = {
  readonly owner: string
  readonly registryAddress: string
  readonly protocolVersion: ProtocolVersion
}

const getVerificationDescription = (
  verification: SearchNameVerification,
  defaultDescription: string,
): string | undefined =>
  match(verification)
    .with(
      { status: 'failed', source: 'owner' },
      () => "Couldn't verify name ownership",
    )
    .with(
      { status: 'failed', source: 'records' },
      () => "Couldn't verify name records",
    )
    .with(
      { status: 'failed', source: 'availability' },
      () => "Couldn't check availability",
    )
    .with({ status: 'available' }, () => 'Available to register')
    .with({ status: 'not-found' }, () => 'Name not found')
    .with({ status: P.union('checking', 'unchecked') }, () => undefined)
    .otherwise(() => defaultDescription)

export const getSearchSuggestionPresentation = ({
  suggestion,
  owner,
  isOffchain,
  isAvailable,
  isPendingAvailability,
  verification,
}: {
  readonly suggestion: Suggestion
  readonly owner: SearchOwner | null | undefined
  readonly isOffchain: boolean
  readonly isAvailable: boolean
  readonly isPendingAvailability: boolean
  readonly verification: SearchNameVerification | undefined
}) => {
  const isName = suggestion.id.startsWith('name:')
  if (!isName)
    return {
      hasAvatar: false,
      isLoading: false,
      isDisabled: false,
      description: suggestion.description,
    }

  const state =
    verification ??
    getSearchNameVerification({
      isSubname: isSubname(suggestion.inputValue),
      isEnabled: true,
      owner:
        owner === undefined ? 'pending' : owner === null ? 'absent' : 'present',
      records: isOffchain ? 'resolved' : 'empty',
      availability: isAvailable
        ? 'available'
        : isPendingAvailability
          ? 'pending'
          : 'unchecked',
    })
  const description = getVerificationDescription(state, suggestion.description)
  return {
    hasAvatar: (owner !== undefined && owner !== null) || isOffchain,
    isLoading: description === undefined,
    isDisabled: state.status === 'not-found',
    description,
  }
}

/**
 * Moves the suggestion for `exactMatchName` to the front, keeping the relative
 * order of the rest. The exact match is what the user typed, so it must be the
 * first item Enter selects — ahead of other TLDs or available-to-register names.
 */
export function sortExactMatchFirst(
  suggestions: readonly Suggestion[],
  exactMatchName: string,
): readonly Suggestion[] {
  const index = suggestions.findIndex(
    (s) => s.inputValue.trim().toLowerCase() === exactMatchName,
  )
  const exactMatch = suggestions[index]
  if (index <= 0 || !exactMatch) return suggestions
  return [
    exactMatch,
    ...suggestions.slice(0, index),
    ...suggestions.slice(index + 1),
  ]
}
