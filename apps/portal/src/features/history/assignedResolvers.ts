import {
  type HistoryEvent,
  type IndexerReadError,
  readAllItems,
} from '@ens-apps/indexer/reads'
import { okAsync, ResultAsync } from 'neverthrow'
import { indexer } from '@/lib/indexer'
import { normalizeOrLower } from '@/utils/ens/normalizeOrLower'
import { requireIndexed } from './requireIndexed'

type HistoryRow = HistoryEvent

/** The indexer's largest history page. */
const MAX_PAGE_SIZE = 200

/** A row's place on chain; a state-derived row with no log sorts first in its block. */
type Position = readonly [block: number, logIndex: number]

type Assignment = Readonly<{
  position: Position
  /** Null when the pointer was cleared. */
  resolver: string | null
}>

/** Each pointing contract's assignments, oldest first. */
export type ResolverTimeline = ReadonlyMap<string, readonly Assignment[]>

const positionOf = (row: HistoryRow): Position | null =>
  row.blockNumber === null ? null : [row.blockNumber, row.logIndex ?? -1]

const isAtOrBefore = (a: Position, b: Position) =>
  a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1])

const toAssignment = (row: HistoryRow): Assignment | null => {
  const position = positionOf(row)
  if (!position) return null
  if (row.type === 'resolver' && row.data?.action === 'resolver_changed')
    return {
      position,
      resolver: row.data.resolver?.address.toLowerCase() ?? null,
    }
  if (row.type === 'registration' && row.data?.resolver)
    return { position, resolver: row.data.resolver.address.toLowerCase() }
  return null
}

/** Groups the pointer changes by the registry that made them. */
export const toResolverTimeline = (
  rows: readonly HistoryRow[],
): ResolverTimeline => {
  const timeline = new Map<string, Assignment[]>()
  for (const row of rows) {
    const assignment = toAssignment(row)
    if (!assignment) continue
    const source = row.contractAddress?.toLowerCase() ?? 'state'
    timeline.set(source, [...(timeline.get(source) ?? []), assignment])
  }
  for (const assignments of timeline.values())
    assignments.sort((a, b) => (isAtOrBefore(a.position, b.position) ? -1 : 1))
  return timeline
}

/**
 * Whether a record write landed on a resolver some registry pointed the name
 * at when it was written. Any contract can emit a record event for any node,
 * and the indexer attributes it to the name, so a write is kept only from an
 * assigned resolver. A row it cannot place is dropped.
 */
export const isAssignedRecord = (
  row: HistoryRow,
  timeline: ResolverTimeline,
): boolean => {
  if (row.type !== 'record') return true
  const position = positionOf(row)
  const resolver = (
    row.data?.resolver?.address ?? row.contractAddress
  )?.toLowerCase()
  if (!position || !resolver) return false
  return [...timeline.values()].some((assignments) => {
    const current = assignments.findLast((assignment) =>
      isAtOrBefore(assignment.position, position),
    )
    return current?.resolver === resolver
  })
}

/** Every resolver pointer change of one name, oldest first. */
const readResolverTimeline = (name: string, signal?: AbortSignal) =>
  readAllItems(
    (cursor, pageSignal) =>
      indexer
        .getNameHistory(
          {
            name: normalizeOrLower(name),
            types: ['resolver', 'registration'],
            order: 'asc',
            pageSize: MAX_PAGE_SIZE,
            ...(cursor && { cursor }),
          },
          { signal: pageSignal },
        )
        .andThen(requireIndexed(name)),
    { signal },
  ).map(toResolverTimeline)

/**
 * Drops record writes from contracts that were not the name's resolver. A row
 * with no name stays: it is shown as what its contract emitted, for no name.
 */
export const dropUnassignedRecords = <Row extends HistoryRow>(
  rows: readonly Row[],
  signal?: AbortSignal,
): ResultAsync<Row[], IndexerReadError> => {
  const names = [
    ...new Set(
      rows.flatMap((row) =>
        row.type === 'record' && row.name ? row.name : [],
      ),
    ),
  ]
  if (names.length === 0) return okAsync([...rows])
  return ResultAsync.combine(
    names.map((name) =>
      readResolverTimeline(name, signal).map(
        (timeline) => [name, timeline] as const,
      ),
    ),
  ).map((entries) => {
    const timelines = new Map(entries)
    return rows.filter((row) => {
      if (row.type !== 'record' || !row.name) return true
      const timeline = timelines.get(row.name)
      return timeline ? isAssignedRecord(row, timeline) : false
    })
  })
}
