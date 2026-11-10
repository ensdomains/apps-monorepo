import { match } from 'ts-pattern'
import type { UseSearchResultsReturn } from '@/features/dashboard/hooks/useSearchResults'
import { buildSearchResultItems } from '@/features/dashboard/utils/searchResultsUtils'
import { parsePaletteQuery, shouldSearchEntities } from './core/search'
import type { PaletteFrame } from './core/state'
import type { PaletteCommand, PaletteContext } from './core/types'
import { getEntityLabel } from './resultModel'

export const getPalettePresentation = (
  frame: PaletteFrame,
  commands: readonly PaletteCommand[],
) =>
  match(frame.screen)
    .with({ type: 'root' }, () => ({
      title: 'Search',
      placeholder: 'Search names, addresses, or actions…',
    }))
    .with({ type: 'entity' }, ({ entity }) => ({
      title: getEntityLabel(entity),
      placeholder: 'Search actions…',
    }))
    .with({ type: 'target' }, ({ commandId, target }) => ({
      title:
        commands.find((command) => command.id === commandId)?.title ??
        'Choose target',
      placeholder: `Choose a ${target}…`,
    }))
    .with({ type: 'developer' }, () => ({
      title: 'Developer tools',
      placeholder: 'Search developer tools…',
    }))
    .exhaustive()

export const getEntityQueryPolicy = (
  frame: PaletteFrame,
  context: PaletteContext,
  commands: readonly PaletteCommand[],
) => {
  const query = parsePaletteQuery(frame.query).query
  const isEnabled = match(frame.screen)
    .with({ type: 'target' }, () => Boolean(query))
    .with({ type: 'root' }, () =>
      shouldSearchEntities({
        query: frame.query,
        commands,
        developerEnabled: context.developerEnabled,
      }),
    )
    .otherwise(() => false)
  return {
    query,
    isEnabled,
    shouldFetchOwnedNames:
      frame.screen.type === 'target' && frame.screen.target === 'name',
  }
}

export const visibleSearchResults = (
  data: UseSearchResultsReturn,
  query: string,
  isPicker: boolean,
): UseSearchResultsReturn => {
  if (!isPicker || query) return data
  const ownedNamesFiltered = [...data.ownedNameSuggestions]
  return {
    ...data,
    ownedNamesFiltered,
    allItems: buildSearchResultItems({
      suggestions: data.suggestions,
      availableNames: data.availableNames,
      ownedNamesFiltered,
    }),
    hasAnySection: data.suggestions.length > 0 || ownedNamesFiltered.length > 0,
  }
}

export const getSearchFeedback = (
  data: UseSearchResultsReturn,
  isEnabled: boolean,
  isDebouncing: boolean,
) => ({
  hasReadFailure:
    isEnabled &&
    data.failedOwnerIds.size +
      data.failedAvailabilityIds.size +
      data.failedRecordsIds.size >
      0,
  isSearching:
    isEnabled &&
    (isDebouncing ||
      data.pendingAvailabilityIds.size > 0 ||
      [...data.nameVerificationBySuggestionId.values()].some(
        ({ status }) => status === 'checking',
      )),
})

export const getFailedSearchReads = (data: UseSearchResultsReturn) =>
  data.suggestions.flatMap(({ id, inputValue: name }) => [
    ...(data.failedOwnerIds.has(id)
      ? [{ name, source: 'owner' as const }]
      : []),
    ...(data.failedAvailabilityIds.has(id)
      ? [{ name, source: 'availability' as const }]
      : []),
    ...(data.failedRecordsIds.has(id)
      ? [{ name, source: 'records' as const }]
      : []),
  ])

export const getEnabledCommands = (
  commands: readonly PaletteCommand[],
  tools: {
    readonly timeTravel: boolean
    readonly migration: boolean
    readonly designQa: boolean
  },
): readonly PaletteCommand[] =>
  commands.filter((command) => {
    if (command.operation.type !== 'developer') return true
    return match(command.operation.tool)
      .with(
        'drawer',
        () => tools.timeTravel || tools.migration || tools.designQa,
      )
      .with('time-travel', () => tools.timeTravel)
      .with('migration', () => tools.migration)
      .with('design-qa', () => tools.designQa)
      .exhaustive()
  })

export type TitleParts = {
  readonly before: string
  readonly match: string
  readonly after: string
}

export const getTitleParts = (title: string, query: string): TitleParts => {
  const needle = query.trim().toLowerCase()
  const haystack = title.toLowerCase()
  // Case folding that changes length (e.g. 'İ') would misalign the slices.
  const index =
    needle && haystack.length === title.length ? haystack.indexOf(needle) : -1
  if (index < 0) return { before: title, match: '', after: '' }
  return {
    before: title.slice(0, index),
    match: title.slice(index, index + needle.length),
    after: title.slice(index + needle.length),
  }
}
