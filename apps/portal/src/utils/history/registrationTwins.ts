import type { EventDataByType, EventType } from '@ens-apps/indexer/bigname'

/** A history row, its `data` typed by its friendly type. */
type HistoryRow = {
  readonly [TType in EventType]: {
    readonly type: TType
    readonly data?: EventDataByType[TType] | null
  }
}[EventType]

const registrationData = (row: HistoryRow) =>
  row.type === 'registration' ? (row.data ?? undefined) : undefined

const actionOf = (row: HistoryRow): string | undefined =>
  registrationData(row)?.action_id

const roleOf = (row: HistoryRow): string | undefined =>
  registrationData(row)?.action_role

const isSet = ([, value]: readonly [string, unknown]) =>
  value !== null && value !== undefined

/** `primary` with the fields it lacks taken from `fallback`. */
const withFallback = (primary: object, fallback: object) => ({
  ...fallback,
  ...Object.fromEntries(Object.entries(primary).filter(isSet)),
})

/**
 * One row per registration action. bigname repeats a registration's grant as a
 * `linked` row beside the `registered` one, under the same `action_id`; the
 * `registered` row stays and takes what it lacks from its twin (the
 * `registration_id`, a charge only the twin carries). A `linked` row whose
 * twin is not loaded stays as it is.
 */
export const mergeRegistrationTwins = <TRow extends HistoryRow>(
  rows: readonly TRow[],
): TRow[] => {
  const linked = new Map<string, TRow>()
  const registered = new Set<string>()
  for (const row of rows) {
    const actionId = actionOf(row)
    if (!actionId) continue
    if (roleOf(row) === 'linked') linked.set(actionId, row)
    if (roleOf(row) === 'registered') registered.add(actionId)
  }
  return rows.flatMap((row) => {
    const actionId = actionOf(row)
    if (!actionId || !registered.has(actionId)) return [row]
    if (roleOf(row) === 'linked') return []
    const twin = linked.get(actionId)
    if (!twin) return [row]
    return [
      {
        ...withFallback(row, twin),
        data: withFallback(row.data ?? {}, twin.data ?? {}),
      } as TRow,
    ]
  })
}
