import type { MigrationBatchJournalScope } from './migrationBatchJournal'

type Locks = Pick<LockManager, 'request' | 'query'>

const browserLocks = (): Locks | undefined => {
  const locks = globalThis.navigator?.locks
  return typeof locks?.request === 'function' &&
    typeof locks.query === 'function'
    ? locks
    : undefined
}

const leasePrefix = (scope: MigrationBatchJournalScope): string =>
  `ens-apps:migration-intent:${scope.chainId}:${scope.owner.toLowerCase()}:${scope.hca.toLowerCase()}:`

/** Holds a browser-wide lock while an intent's wallet prompt may be open; resolves with its release. */
export const acquireMigrationIntentLease = (
  scope: MigrationBatchJournalScope,
  intentId: string,
): Promise<() => void> => {
  const locks = browserLocks()
  if (!locks) return Promise.resolve(() => undefined)
  return new Promise((granted) => {
    locks
      .request(
        `${leasePrefix(scope)}${intentId}`,
        () => new Promise<void>((release) => granted(release)),
      )
      .catch(() => granted(() => undefined))
  })
}

/** Intent ids whose prompt is still held by a run in any tab, or undefined without Web Locks. */
export const readHeldMigrationIntentIds = async (
  scope: MigrationBatchJournalScope,
): Promise<ReadonlySet<string> | undefined> => {
  const locks = browserLocks()
  if (!locks) return undefined
  const prefix = leasePrefix(scope)
  const { held = [] } = await locks.query()
  return new Set(
    held.flatMap(({ name }) =>
      name?.startsWith(prefix) ? [name.slice(prefix.length)] : [],
    ),
  )
}
