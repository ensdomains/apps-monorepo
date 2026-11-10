import { match } from 'ts-pattern'
import { isAddress } from 'viem'
import type { UseSearchResultsReturn } from '@/features/dashboard/hooks/useSearchResults'
import type { Suggestion } from '@/features/dashboard/utils/buildSearchSuggestions'
import { ensureEthSuffix } from '@/utils/ens/ensureEthSuffix'
import { isEthName } from '@/utils/ens/tldHelpers'
import { isValidEnsName } from '@/utils/token/isNormalized'
import { PALETTE_COMMANDS } from './catalog'
import type { PageCommand } from './context'
import type { RecentEntity } from './core/recents'
import {
  getCommandResultId,
  getCommandSearchScore,
  getEntityId,
  parsePaletteQuery,
  searchCommands,
} from './core/search'
import type { PaletteFrame } from './core/state'
import type {
  PaletteCommand,
  PaletteCommandMatch,
  PaletteContext,
  PaletteEntity,
  PaletteIcon,
  PaletteScope,
  PaletteTargetMetadata,
} from './core/types'
import type { PaletteRelatedEntity, PaletteRelation } from './relatedEntities'

export type PaletteRowAction =
  | {
      readonly type: 'command'
      readonly command: PaletteCommand
      readonly entity?: PaletteEntity
    }
  | {
      readonly type: 'view'
      readonly entity: PaletteEntity
      readonly resolver?: boolean
    }
  | { readonly type: 'actions'; readonly entity: PaletteEntity }
  | { readonly type: 'pick'; readonly entity: PaletteEntity }
  | { readonly type: 'another-target'; readonly command: PaletteCommand }
  | { readonly type: 'query'; readonly query: string }
  | { readonly type: 'developer' }
  | { readonly type: 'page'; readonly command: PageCommand }
  | { readonly type: 'clear-recents' }
  | { readonly type: 'copy'; readonly value: string; readonly label: string }

export type PaletteRowLeading =
  | { readonly type: 'entity'; readonly entity: PaletteEntity }
  | { readonly type: 'icon'; readonly icon: PaletteIcon }

export type PaletteRowMeta = {
  readonly text: string
  readonly tone: 'muted' | 'positive' | 'warning' | 'pending'
}

export type PaletteRow = {
  readonly id: string
  readonly title: string
  readonly meta?: PaletteRowMeta
  readonly group: string
  readonly groupDetail?: string
  readonly isGroupClearable?: boolean
  readonly leading: PaletteRowLeading
  readonly action: PaletteRowAction
  readonly actionsFor?: PaletteEntity
  readonly hasNextStep?: boolean
}

type EntitySuggestion = Pick<Suggestion, 'id' | 'inputValue' | 'label'>

type BuildPaletteRowsParams = {
  readonly frame: PaletteFrame
  readonly context: PaletteContext
  readonly data: UseSearchResultsReturn
  readonly recents: readonly RecentEntity[]
  readonly pageCommands: readonly PageCommand[]
  readonly commands?: readonly PaletteCommand[]
  readonly targetMetadata?: PaletteTargetMetadata
  readonly related?: readonly PaletteRelatedEntity[]
}

const DEFAULT_NAME_COMMANDS = [
  'name.edit-records',
  'name.renew',
  'name.records',
]
const DEFAULT_READ_COMMANDS = ['name.records', 'name.history', 'name.copy']
const DEFAULT_ADDRESS_COMMANDS = [
  'address.names',
  'address.reverse-resolution',
  'address.copy',
]
const DEFAULT_NAVIGATION = [
  'wallet.names',
  'wallet.primary-name',
  'name.register',
  'navigation.dashboard',
]
const DEFAULT_VISITOR_NAVIGATION = [
  'wallet.connect',
  'name.register',
  'navigation.dashboard',
]
const SUGGESTED_ENTITY_COMMANDS = [
  'name.register',
  'name.renew',
  'name.edit-records',
  'name.create-subname',
  'name.transfer',
  'address.names',
  'address.reverse-resolution',
]

export const getEntityLabel = (entity: PaletteEntity): string =>
  entity.type === 'name' ? entity.name : entity.address

const suggestionEntity = (
  suggestion: EntitySuggestion,
): PaletteEntity | undefined => {
  if (suggestion.id.startsWith('name:') || suggestion.id.startsWith('owned:'))
    return { type: 'name', name: suggestion.inputValue }
  if (isAddress(suggestion.inputValue, { strict: false }))
    return { type: 'address', address: suggestion.inputValue }
  return undefined
}

const OWNED_META: PaletteRowMeta = { text: 'Your name', tone: 'muted' }

const getVerificationMeta = (
  suggestion: EntitySuggestion,
  data: UseSearchResultsReturn,
): PaletteRowMeta | undefined => {
  const verification = data.nameVerificationBySuggestionId.get(suggestion.id)
  if (!verification)
    return suggestion.id.startsWith('owned:') ? OWNED_META : undefined
  return match(verification.status)
    .returnType<PaletteRowMeta | undefined>()
    .with('available', () => ({ text: 'Available', tone: 'positive' }))
    .with('checking', () => ({ text: 'Checking…', tone: 'pending' }))
    .with('failed', () => ({ text: 'Couldn’t verify', tone: 'warning' }))
    .with('not-found', () => ({
      text: isEthName(suggestion.inputValue)
        ? 'Not found'
        : 'No ENS records found',
      tone: 'muted',
    }))
    .with('resolved', () => ({ text: 'Found in ENS', tone: 'positive' }))
    .with('offchain', () => ({ text: 'Offchain', tone: 'muted' }))
    .otherwise(() => undefined)
}

const getRegisterRow = (
  row: PaletteRow,
  entity: PaletteEntity,
  register: PaletteCommand | undefined,
): readonly PaletteRow[] =>
  register
    ? [
        {
          id: `register:${row.id}`,
          title: `Register ${getEntityLabel(entity)}`,
          group: row.group,
          leading: { type: 'icon', icon: register.icon },
          action: { type: 'command', command: register, entity },
        },
      ]
    : []

const getSuggestionRows = ({
  suggestion,
  data,
  frame,
  chainId,
  commands,
}: {
  readonly suggestion: EntitySuggestion
  readonly data: UseSearchResultsReturn
  readonly frame: PaletteFrame
  readonly chainId: number
  readonly commands: readonly PaletteCommand[]
}): readonly PaletteRow[] => {
  const entity = suggestionEntity(suggestion)
  if (!entity) return []
  const isPicker = frame.screen.type === 'target'
  if (frame.screen.type === 'target' && entity.type !== frame.screen.target)
    return []
  const isResolver = suggestion.id.startsWith('resolver:')
  const row: PaletteRow = {
    id: isPicker
      ? `pick:${chainId}:${getEntityId(entity)}`
      : `${chainId}:${suggestion.id}`,
    title: getEntityLabel(entity),
    meta: isResolver
      ? { text: 'Resolver', tone: 'muted' }
      : getVerificationMeta(suggestion, data),
    group: isPicker ? 'Choose a target' : 'Names and addresses',
    leading: { type: 'entity', entity },
    action: isPicker
      ? { type: 'pick', entity }
      : { type: 'view', entity, resolver: isResolver },
  }
  if (isPicker || isResolver) return [row]
  const isAvailable = data.availableNames.some(({ id }) => id === suggestion.id)
  const register = isAvailable
    ? commands.find(({ id }) => id === 'name.register')
    : undefined
  return [
    { ...row, actionsFor: entity },
    ...getRegisterRow(row, entity, register),
  ]
}

const getEntityRows = ({
  data,
  frame,
  context,
  commands,
}: BuildPaletteRowsParams & {
  readonly commands: readonly PaletteCommand[]
}): readonly PaletteRow[] => {
  const isRootLookup =
    frame.screen.type === 'root' &&
    parsePaletteQuery(frame.query).mode === 'unified'
  if (!isRootLookup && frame.screen.type !== 'target') return []
  const suggestions: readonly EntitySuggestion[] = [
    ...data.suggestions,
    ...data.ownedNamesFiltered.map(({ name }) => ({
      id: `owned:${name}`,
      inputValue: name,
      label: name,
    })),
  ]
  return suggestions.flatMap((suggestion) =>
    getSuggestionRows({
      suggestion,
      data,
      frame,
      chainId: context.chainId,
      commands,
    }),
  )
}

const getPickerShortcuts = ({
  frame,
  context,
  recents,
}: BuildPaletteRowsParams): readonly PaletteRow[] => {
  if (frame.screen.type !== 'target' || frame.query.trim()) return []
  const target = frame.screen.target
  const wallet: readonly PaletteEntity[] =
    context.walletAddress && target === 'address'
      ? [{ type: 'address', address: context.walletAddress }]
      : []
  return [...wallet, ...recents.map(({ entity }) => entity)]
    .filter((entity) => entity.type === target)
    .map((entity) => ({
      id: `pick:${context.chainId}:${getEntityId(entity)}`,
      title: getEntityLabel(entity),
      meta:
        entity.type === 'address' &&
        entity.address.toLowerCase() === context.walletAddress?.toLowerCase()
          ? { text: 'Connected wallet', tone: 'muted' as const }
          : { text: 'Recently viewed', tone: 'muted' as const },
      group: 'Choose a target',
      leading: { type: 'entity' as const, entity },
      action: { type: 'pick' as const, entity },
    }))
}

const getScopedRows = (
  commands: readonly PaletteRow[],
  related: readonly PaletteRow[],
  query: string,
): readonly PaletteRow[] => {
  const isView = (row: PaletteRow) =>
    row.action.type === 'command' &&
    (row.action.command.id === 'name.view' ||
      row.action.command.id === 'address.view')
  const suggested = query.trim()
    ? []
    : SUGGESTED_ENTITY_COMMANDS.flatMap((id) =>
        commands
          .filter(
            (row) =>
              row.action.type === 'command' && row.action.command.id === id,
          )
          .map((row) => ({ ...row, group: 'Suggested' })),
      )
  const suggestedIds = new Set(suggested.map(({ id }) => id))
  return [
    ...commands.filter(isView).map((row) => ({ ...row, group: 'Open' })),
    ...suggested,
    ...related,
    ...commands.filter((row) => !isView(row) && !suggestedIds.has(row.id)),
  ]
}

const getDefaultCommandIds = (context: PaletteContext): readonly string[] => {
  if (context.entity?.type === 'address') return DEFAULT_ADDRESS_COMMANDS
  return context.walletAddress ? DEFAULT_NAME_COMMANDS : DEFAULT_READ_COMMANDS
}

const getCommandGroupLabel = (command: PaletteCommand): string =>
  command.group === 'Navigation' ? 'Go to' : command.group

const getBoundTargetMetadata = (
  entity: PaletteEntity,
  metadata?: PaletteTargetMetadata,
): PaletteTargetMetadata =>
  metadata && getEntityId(metadata.entity) === getEntityId(entity)
    ? metadata
    : { entity }

const canShowCommand = (
  command: PaletteCommand,
  entity: PaletteEntity | undefined,
  metadata?: PaletteTargetMetadata,
): boolean =>
  !entity ||
  !command.isApplicable ||
  command.isApplicable(getBoundTargetMetadata(entity, metadata))

const getCommandRows = ({
  matches,
  frame,
  context,
  isEmptyRoot,
  targetMetadata,
}: {
  readonly matches: readonly PaletteCommandMatch[]
  readonly frame: PaletteFrame
  readonly context: PaletteContext
  readonly isEmptyRoot: boolean
  readonly targetMetadata?: PaletteTargetMetadata
}): readonly PaletteRow[] => {
  if (frame.screen.type === 'target') return []
  const defaults = getDefaultCommandIds(context)
  const navigation = context.walletAddress
    ? DEFAULT_NAVIGATION
    : DEFAULT_VISITOR_NAVIGATION
  const scopedEntity =
    frame.screen.type === 'entity' ? frame.screen.entity : undefined
  return matches
    .filter(
      ({ command }) =>
        frame.screen.type !== 'entity' || command.target === scopedEntity?.type,
    )
    .filter(
      ({ command }) =>
        !isEmptyRoot ||
        navigation.includes(command.id) ||
        (context.entity && defaults.includes(command.id)),
    )
    .filter(({ command, entity }) =>
      canShowCommand(
        command,
        scopedEntity ??
          (isEmptyRoot && defaults.includes(command.id) ? entity : undefined),
        targetMetadata,
      ),
    )
    .map(({ command, title, entity }): PaletteRow => {
      const isCurrent = isEmptyRoot && defaults.includes(command.id)
      const showsTarget = Boolean(scopedEntity) || isCurrent
      return {
        id: getCommandResultId(command, entity, context.chainId),
        title: showsTarget ? command.title : title,
        group: isEmptyRoot
          ? isCurrent
            ? `Current ${context.entity?.type ?? 'name'}`
            : 'Go to'
          : getCommandGroupLabel(command),
        groupDetail:
          isCurrent && context.entity
            ? getEntityLabel(context.entity)
            : undefined,
        leading: { type: 'icon', icon: command.icon },
        action: { type: 'command', command, entity },
        hasNextStep:
          !entity &&
          (command.target === 'name' || command.target === 'address'),
      }
    })
}

const getRecentRows = (
  recents: readonly RecentEntity[],
  context: PaletteContext,
): readonly PaletteRow[] =>
  recents
    .filter(
      ({ entity }) =>
        !context.entity || getEntityId(entity) !== getEntityId(context.entity),
    )
    .map(
      ({ entity }): PaletteRow => ({
        id: `recent:${context.chainId}:${getEntityId(entity)}`,
        title: getEntityLabel(entity),
        group: 'Recently viewed',
        isGroupClearable: true,
        leading: { type: 'entity', entity },
        action: { type: 'view', entity },
        actionsFor: entity,
      }),
    )

const getPageRows = ({
  pageCommands,
  frame,
  context,
  scope,
  query,
}: {
  readonly pageCommands: readonly PageCommand[]
  readonly frame: PaletteFrame
  readonly context: PaletteContext
  readonly scope: PaletteScope
  readonly query: string
}): readonly PaletteRow[] => {
  if (frame.screen.type !== 'root' && frame.screen.type !== 'developer')
    return []
  if (scope === 'developer' && !context.developerEnabled) return []
  return pageCommands
    .filter((command) => (command.scope ?? 'normal') === scope)
    .filter(
      (command) =>
        !query ||
        getCommandSearchScore(
          { title: command.title, keywords: command.keywords ?? [] },
          query,
        ) > 0,
    )
    .slice(0, query ? 10 : 3)
    .map(
      (command): PaletteRow => ({
        id: `page:${command.id}`,
        title: command.title,
        meta: getPageCommandMeta(command),
        group: 'On this page',
        leading: { type: 'icon', icon: 'page' },
        action: { type: 'page', command },
      }),
    )
}

const getPageCommandMeta = (
  command: PageCommand,
): PaletteRowMeta | undefined => {
  if (command.disabledReason)
    return { text: command.disabledReason, tone: 'warning' }
  return command.description
    ? { text: command.description, tone: 'muted' }
    : undefined
}

const RELATION_LABELS = {
  owner: 'Owner',
  manager: 'Manager',
  'eth-address': 'ETH address',
  resolver: 'Resolver',
  parent: 'Parent name',
  'primary-name': 'Primary name',
} as const satisfies Record<PaletteRelation, string>

const getRelatedSubject = (
  frame: PaletteFrame,
  context: PaletteContext,
): PaletteEntity | undefined => {
  if (frame.screen.type === 'entity') return frame.screen.entity
  const parsed = parsePaletteQuery(frame.query)
  const isRootLookup =
    frame.screen.type === 'root' && parsed.mode === 'unified' && parsed.query
  return isRootLookup ? context.entity : undefined
}

// The entity screen lists every relation; on a page the current entity's relations need a query.
const getRelatedRows = (
  frame: PaletteFrame,
  context: PaletteContext,
  related: readonly PaletteRelatedEntity[],
): readonly PaletteRow[] => {
  const subject = getRelatedSubject(frame, context)
  if (!subject) return []
  return related
    .map(({ entity, relations }) => ({
      entity,
      relations,
      label: relations.map((relation) => RELATION_LABELS[relation]).join(' · '),
    }))
    .filter(
      ({ entity, label }) =>
        getCommandSearchScore(
          { title: label, keywords: [getEntityLabel(entity)] },
          frame.query,
        ) > 0,
    )
    .map(({ entity, relations, label }): PaletteRow => {
      const isResolver = relations.includes('resolver')
      return {
        id: `related:${context.chainId}:${getEntityId(subject)}:${relations.join('+')}:${getEntityId(entity)}`,
        title: getEntityLabel(entity),
        meta: { text: label, tone: 'muted' },
        group: 'Related',
        groupDetail:
          frame.screen.type === 'entity' ? undefined : getEntityLabel(subject),
        leading: { type: 'entity', entity },
        action: { type: 'view', entity, resolver: isResolver },
        actionsFor: isResolver ? undefined : entity,
      }
    })
}

const getRelatedCopyRows = (
  frame: PaletteFrame,
  related: readonly PaletteRelatedEntity[],
): readonly PaletteRow[] => {
  if (frame.screen.type !== 'entity' || frame.screen.entity.type !== 'name')
    return []
  const title = 'Copy ETH address'
  if (
    !getCommandSearchScore(
      { title, keywords: ['copy payment address', 'copy resolved address'] },
      frame.query,
    )
  )
    return []
  return related
    .filter(
      ({ entity, relations }) =>
        entity.type === 'address' && relations.includes('eth-address'),
    )
    .map(
      ({ entity }): PaletteRow => ({
        id: `copy-eth:${getEntityId(entity)}`,
        title,
        group: 'Actions',
        leading: { type: 'icon', icon: 'copy' },
        action: {
          type: 'copy',
          value: getEntityLabel(entity),
          label: 'ETH address',
        },
      }),
    )
}

const getNameEscapeHatch = (
  frame: PaletteFrame,
  hasCommandMatches: boolean,
): readonly PaletteRow[] => {
  const parsed = parsePaletteQuery(frame.query)
  const query = parsed.query
  if (
    frame.screen.type !== 'root' ||
    parsed.mode !== 'unified' ||
    !hasCommandMatches
  )
    return []
  if (!query || query.includes('.') || query.includes(' ')) return []
  const candidate = ensureEthSuffix(query)
  if (!isValidEnsName(candidate)) return []
  return [
    {
      id: `search:${candidate}`,
      title: `Search for ${candidate}`,
      group: 'Names and addresses',
      leading: { type: 'icon', icon: 'search' },
      action: { type: 'query', query: candidate },
    },
  ]
}

const getDeveloperEntry = (
  frame: PaletteFrame,
  context: PaletteContext,
): readonly PaletteRow[] => {
  if (!context.developerEnabled || frame.screen.type !== 'root') return []
  const query = parsePaletteQuery(frame.query).query.toLowerCase()
  if (query && !'developer tools'.includes(query)) return []
  return [
    {
      id: 'scope:developer',
      title: 'Developer tools',
      group: 'Go to',
      leading: { type: 'icon', icon: 'developer' },
      action: { type: 'developer' },
      hasNextStep: true,
    },
  ]
}

const getAnotherTarget = (
  frame: PaletteFrame,
  matches: readonly PaletteCommandMatch[],
): readonly PaletteRow[] => {
  if (frame.screen.type !== 'root' || !parsePaletteQuery(frame.query).query)
    return []
  const first = matches.at(0)
  if (!first?.entity || first.command.target !== 'name') return []
  return [
    {
      id: `another:${first.command.id}`,
      title: first.command.title.endsWith(' name')
        ? `${first.command.title.slice(0, -' name'.length)} another name`
        : `${first.command.title} for another name`,
      group: getCommandGroupLabel(first.command),
      leading: { type: 'icon', icon: first.command.icon },
      action: { type: 'another-target', command: first.command },
      hasNextStep: true,
    },
  ]
}

const isEmptyRootFrame = (frame: PaletteFrame): boolean =>
  frame.screen.type === 'root' &&
  !parsePaletteQuery(frame.query).query &&
  parsePaletteQuery(frame.query).mode === 'unified'

export const getDisplayedRows = (
  rows: readonly PaletteRow[],
): readonly PaletteRow[] => {
  const groups = [...new Set(rows.map(({ group }) => group))]
  return groups.flatMap((group) => rows.filter((row) => row.group === group))
}

const uniqueRows = (rows: readonly PaletteRow[]): readonly PaletteRow[] =>
  rows.filter(
    (row, index) =>
      rows.findIndex((candidate) => candidate.id === row.id) === index,
  )

export const buildPaletteRows = (
  params: BuildPaletteRowsParams,
): readonly PaletteRow[] => {
  const {
    frame,
    context,
    data,
    recents,
    pageCommands,
    commands = PALETTE_COMMANDS,
    targetMetadata,
    related = [],
  } = params
  const query = parsePaletteQuery(frame.query).query
  const scope = frame.screen.type === 'developer' ? 'developer' : 'normal'
  const matches = searchCommands({
    commands,
    query: frame.query,
    context,
    scope,
    entity: frame.screen.type === 'entity' ? frame.screen.entity : undefined,
  })
  const isEmptyRoot = isEmptyRootFrame(frame)
  const commandRows = getCommandRows({
    matches,
    frame,
    context,
    isEmptyRoot,
    targetMetadata,
  })
  const pages = getPageRows({ pageCommands, frame, context, scope, query })
  const developer = getDeveloperEntry(frame, context)
  if (isEmptyRoot) {
    const current = commandRows.filter(({ group }) =>
      group.startsWith('Current '),
    )
    const navigation = commandRows.filter(({ group }) => group === 'Go to')
    return getDisplayedRows(
      uniqueRows([
        ...current,
        ...pages,
        ...getRecentRows(recents, context),
        ...navigation,
        ...developer,
      ]),
    )
  }
  const entities = getEntityRows({ ...params, data, commands })
  const another = getAnotherTarget(frame, matches)
  const nameSearch = getNameEscapeHatch(frame, matches.length > 0)
  const explicitEntity =
    query.includes('.') || isAddress(query, { strict: false })
  const relatedRows = getRelatedRows(frame, context, related)
  // Scoped entities keep View first; page relations follow matching commands.
  const leadingRows = match({
    isScoped: frame.screen.type === 'entity',
    explicitEntity,
  })
    .with({ isScoped: true }, () =>
      getScopedRows(commandRows, relatedRows, frame.query),
    )
    .with({ explicitEntity: true }, () => [
      ...entities,
      ...commandRows,
      ...relatedRows,
    ])
    .otherwise(() => [...commandRows, ...relatedRows, ...entities])
  return getDisplayedRows(
    uniqueRows([
      ...leadingRows,
      ...getPickerShortcuts(params),
      ...getRelatedCopyRows(frame, related),
      ...another,
      ...pages,
      ...nameSearch,
      ...developer,
    ]),
  )
}

export const getNextRowId = (
  rows: readonly PaletteRow[],
  selectedId: string,
  direction: 1 | -1,
): string => {
  const displayed = getDisplayedRows(rows)
  if (!displayed.length) return ''
  const index = displayed.findIndex(({ id }) => id === selectedId)
  const next =
    index < 0
      ? direction === 1
        ? 0
        : displayed.length - 1
      : (index + direction + displayed.length) % displayed.length
  return displayed[next]?.id ?? ''
}

export const getSecondaryRow = (row: PaletteRow): PaletteRow | undefined =>
  row.actionsFor
    ? {
        ...row,
        id: `actions:${row.id}`,
        action: { type: 'actions', entity: row.actionsFor },
        actionsFor: undefined,
      }
    : undefined

export const getRowEnterLabel = (row: PaletteRow): string =>
  match(row.action)
    .with({ type: 'command' }, ({ command }) =>
      match(command.operation.type)
        .with('copy', () => 'Copy')
        .with('disconnect', () => 'Disconnect')
        .otherwise(() =>
          row.hasNextStep ? `Choose ${command.target}` : 'Open',
        ),
    )
    .with({ type: 'view' }, ({ entity, resolver }) =>
      entity.type === 'name'
        ? 'Open name'
        : resolver
          ? 'Open resolver'
          : 'Open address',
    )
    .with({ type: 'actions' }, () => 'Show actions')
    .with({ type: 'pick' }, () => 'Select')
    .with({ type: 'another-target' }, () => 'Choose name')
    .with({ type: 'query' }, () => 'Search')
    .with({ type: 'developer' }, () => 'Show tools')
    .with({ type: 'page' }, () => 'Run')
    .with({ type: 'clear-recents' }, () => 'Clear')
    .with({ type: 'copy' }, () => 'Copy')
    .exhaustive()
