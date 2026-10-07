/**
 * The names a migration just finished, so the dashboard can wait for them.
 *
 * A migrated name leaves the V1 subgraph as soon as the transaction lands but
 * only reaches the V2 indexer a few seconds later, and the dashboard list is
 * built from both: for that gap the name is in neither and reads as gone. The
 * dashboard keeps refreshing while a name recorded here is still missing.
 *
 * Kept in `sessionStorage`: the handoff is a navigation inside one tab, and a
 * stale marker from another tab or another day would poll for nothing.
 */
const STORAGE_KEY = 'ens-recently-migrated-names-v1'

/**
 * How long a recorded name is still worth waiting for. Long enough for an
 * indexer that has fallen behind, short enough that a name which never arrives
 * (reorg, failed ingest) stops the polling instead of running all session.
 */
const RECENTLY_MIGRATED_TTL_MS = 5 * 60 * 1000

type RecentlyMigrated = {
  readonly names: readonly string[]
  readonly recordedAt: number
}

const isRecentlyMigrated = (value: unknown): value is RecentlyMigrated => {
  if (!value || typeof value !== 'object') return false

  const record = value as Record<string, unknown>
  return (
    Array.isArray(record.names) &&
    record.names.every((name) => typeof name === 'string') &&
    typeof record.recordedAt === 'number'
  )
}

export const recordRecentlyMigratedNames = (
  names: readonly string[],
  now: number = Date.now(),
): void => {
  if (typeof window === 'undefined' || names.length === 0) return

  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ names, recordedAt: now } satisfies RecentlyMigrated),
    )
  } catch {
    // Without storage the dashboard just waits for its own refetch, which is
    // the behaviour this exists to improve, not to depend on.
  }
}

export const clearRecentlyMigratedNames = (): void => {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/** The names recorded by the last migration, while they are still recent. */
export const getRecentlyMigratedNames = (
  now: number = Date.now(),
): readonly string[] => {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!isRecentlyMigrated(parsed)) return []
    if (now - parsed.recordedAt > RECENTLY_MIGRATED_TTL_MS) {
      clearRecentlyMigratedNames()
      return []
    }

    return parsed.names
  } catch {
    return []
  }
}
