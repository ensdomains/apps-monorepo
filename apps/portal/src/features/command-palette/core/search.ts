import { match } from 'ts-pattern'
import { getAddress, isAddress } from 'viem'
import { isValidEnsName } from '@/utils/token/isNormalized'
import type {
  CommandTargetResolution,
  PaletteCommand,
  PaletteCommandMatch,
  PaletteContext,
  PaletteEntity,
  PaletteScope,
} from './types'

export const getEntityId = (entity: PaletteEntity): string =>
  match(entity)
    .with({ type: 'name' }, ({ name }) => `name:${name}`)
    .with(
      { type: 'address' },
      ({ address }) => `address:${address.toLowerCase()}`,
    )
    .exhaustive()

export const getCommandResultId = (
  command: PaletteCommand,
  entity: PaletteEntity | null | undefined,
  chainId: number,
): string =>
  `command:${command.id}:${chainId}:${entity ? getEntityId(entity) : 'no-target'}`

export const parsePaletteQuery = (
  raw: string,
): { readonly mode: 'unified' | 'commands'; readonly query: string } => {
  const query = raw.trim()
  return query.startsWith('>')
    ? { mode: 'commands', query: query.slice(1).trimStart() }
    : { mode: 'unified', query }
}

export const getCommandsForScope = ({
  commands,
  scope,
  developerEnabled,
}: {
  readonly commands: readonly PaletteCommand[]
  readonly scope: PaletteScope
  readonly developerEnabled: boolean
}): readonly PaletteCommand[] =>
  commands.filter(
    (command) =>
      command.scope === scope && (scope === 'normal' || developerEnabled),
  )

export const resolveCommandTarget = ({
  command,
  context,
  entity,
}: {
  readonly command: PaletteCommand
  readonly context: PaletteContext
  readonly entity?: PaletteEntity
}): CommandTargetResolution => {
  const candidate = entity ?? context.entity
  return match(command.target)
    .with('none', () => ({ status: 'ready', entity: null }) as const)
    .with('wallet', () =>
      context.walletAddress
        ? ({
            status: 'ready',
            entity: { type: 'address', address: context.walletAddress },
          } as const)
        : ({ status: 'needs-wallet' } as const),
    )
    .with('name', () =>
      candidate?.type === 'name'
        ? ({ status: 'ready', entity: candidate } as const)
        : ({ status: 'needs-target', target: 'name' } as const),
    )
    .with('address', () =>
      candidate?.type === 'address'
        ? ({ status: 'ready', entity: candidate } as const)
        : ({ status: 'needs-target', target: 'address' } as const),
    )
    .exhaustive()
}

const parseExplicitEntity = (value: string): PaletteEntity | undefined => {
  if (isAddress(value, { strict: false })) {
    return { type: 'address', address: getAddress(value) }
  }
  if (value.includes('.') && isValidEnsName(value)) {
    return { type: 'name', name: value }
  }
  return undefined
}

const getInlineTarget = (
  command: PaletteCommand,
  query: string,
): { readonly query: string; readonly entity?: PaletteEntity } => {
  const splitAt = query.lastIndexOf(' ')
  if (splitAt < 0) return { query }
  const target = parseExplicitEntity(query.slice(splitAt + 1))
  const commandQuery = query.slice(0, splitAt).trim().toLowerCase()
  const isKnownPhrase = [command.title, ...command.keywords].some(
    (term) => term.toLowerCase() === commandQuery,
  )
  if (!target || !isKnownPhrase || command.target !== target.type) {
    return { query }
  }
  return { query: commandQuery, entity: target }
}

const isSubsequence = (query: string, text: string): boolean => {
  const matched = [...text].reduce(
    (index, character) => index + Number(character === query[index]),
    0,
  )
  return matched === query.length
}

const scoreTerm = (query: string, term: string): number => {
  const normalized = term.toLowerCase()
  return match(normalized)
    .when(
      (value) => value === query,
      () => 1000,
    )
    .when(
      (value) => value.startsWith(query),
      () => 750,
    )
    .when(
      (value) => value.split(/\s+/).some((word) => word.startsWith(query)),
      () => 600,
    )
    .when(
      (value) => value.includes(query),
      () => 400,
    )
    .when(
      (value) => query.length >= 3 && isSubsequence(query, value),
      () => 100,
    )
    .otherwise(() => 0)
}

export const getCommandSearchScore = (
  command: Pick<PaletteCommand, 'title' | 'keywords'>,
  query: string,
): number => {
  const normalizedQuery = parsePaletteQuery(query).query.toLowerCase()
  if (!normalizedQuery) return 1
  const titleScore = scoreTerm(normalizedQuery, command.title)
  const keywordScore = Math.max(
    0,
    ...command.keywords.map((term) => scoreTerm(normalizedQuery, term) - 10),
  )
  return Math.max(titleScore, keywordScore)
}

const getContextualTitle = (
  command: PaletteCommand,
  entity: PaletteEntity | undefined,
): string => {
  if (command.target !== 'name' || entity?.type !== 'name') {
    return command.title
  }
  return match(command.operation.type)
    .with('renew', () => `Renew ${entity.name}`)
    .with('register', () => `Register ${entity.name}`)
    .with('import', () => `Import ${entity.name}`)
    .otherwise(() => `${command.title} for ${entity.name}`)
}

export const searchCommands = ({
  commands,
  query,
  context,
  scope = 'normal',
  entity,
}: {
  readonly commands: readonly PaletteCommand[]
  readonly query: string
  readonly context: PaletteContext
  readonly scope?: PaletteScope
  readonly entity?: PaletteEntity
}): readonly PaletteCommandMatch[] => {
  const parsed = parsePaletteQuery(query)
  const available = getCommandsForScope({
    commands,
    scope,
    developerEnabled: context.developerEnabled,
  })
  return available
    .map((command) => {
      const inline = getInlineTarget(command, parsed.query)
      const score = getCommandSearchScore(command, inline.query)
      const resolution = resolveCommandTarget({
        command,
        context,
        entity: inline.entity ?? entity,
      })
      const target = resolution.status === 'ready' ? resolution.entity : null
      const hasContext = command.target !== 'none' && target !== null
      return {
        command,
        title: getContextualTitle(command, target ?? undefined),
        entity: target ?? undefined,
        score: score > 0 ? score + Number(hasContext) * 20 : 0,
      }
    })
    .filter(({ score }) => score > 0)
    .toSorted(
      (a, b) => b.score - a.score || a.command.id.localeCompare(b.command.id),
    )
}

export const shouldSearchEntities = ({
  query,
  commands,
  scope = 'normal',
  developerEnabled,
}: {
  readonly query: string
  readonly commands: readonly PaletteCommand[]
  readonly scope?: PaletteScope
  readonly developerEnabled: boolean
}): boolean => {
  const parsed = parsePaletteQuery(query)
  if (!parsed.query || parsed.mode === 'commands' || scope === 'developer') {
    return false
  }
  if (parseExplicitEntity(parsed.query)) return true
  const available = getCommandsForScope({ commands, scope, developerEnabled })
  const hasCommandIntent = available.some((command) => {
    const inline = getInlineTarget(command, parsed.query)
    if (inline.entity) return true
    return [command.title, ...command.keywords].some(
      (term) => term.toLowerCase() === parsed.query.toLowerCase(),
    )
  })
  return !hasCommandIntent
}
