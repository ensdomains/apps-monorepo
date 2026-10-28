import type { MigrationBatchJournalScope } from './migrationBatchJournal'

const LOCK_PREFIX = 'ens-apps:migration-execution:v1'

export class MigrationExecutionAlreadyActiveError extends Error {
  constructor() {
    super(
      'This migration is already running in another tab. Return to that tab to finish it.',
    )
    this.name = 'MigrationExecutionAlreadyActiveError'
  }
}

export class MigrationExecutionLockUnavailableError extends Error {
  constructor() {
    super(
      'This browser cannot safely prevent two tabs from running the same migration. Open the upgrade page in an up-to-date browser and try again.',
    )
    this.name = 'MigrationExecutionLockUnavailableError'
  }
}

const lockNameFor = (scope: MigrationBatchJournalScope): string =>
  `${LOCK_PREFIX}:${scope.chainId}:${scope.owner.toLowerCase()}:${scope.hca.toLowerCase()}`

const browserLockManager = (): LockManager | undefined => {
  try {
    return globalThis.navigator?.locks
  } catch {
    return undefined
  }
}

/**
 * Web Locks provide the atomic cross-tab ownership decision required here.
 * localStorage and BroadcastChannel cannot provide the same guarantee, so the
 * safe fallback when Web Locks are unavailable is to refuse before running the
 * operation rather than claim exclusivity that the browser cannot enforce.
 */
export const withMigrationExecutionLock = async <T>(
  scope: MigrationBatchJournalScope,
  operation: () => Promise<T>,
): Promise<T> => {
  const locks = browserLockManager()
  if (!locks) throw new MigrationExecutionLockUnavailableError()

  return locks.request(
    lockNameFor(scope),
    { mode: 'exclusive', ifAvailable: true },
    async (lock) => {
      if (!lock) throw new MigrationExecutionAlreadyActiveError()
      return operation()
    },
  )
}
