import type { SubnameMigrationImpact } from '@ens-apps/migration'
import {
  getSubnameMigrationImpactRetryDelay,
  shouldRetrySubnameMigrationImpact,
} from './subnameMigrationImpactQuery.helpers'

const waitForRetry = (delayMs: number, signal?: AbortSignal): Promise<void> => {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Retry the complete read; a partial or previously cached result cannot authorize an upgrade. */
export const readSubnameMigrationImpactWithRetry = (params: {
  readonly read: () => Promise<SubnameMigrationImpact>
  readonly signal?: AbortSignal
}): Promise<SubnameMigrationImpact> => {
  const attempt = async (
    failureCount: number,
  ): Promise<SubnameMigrationImpact> => {
    params.signal?.throwIfAborted()
    try {
      const impact = await params.read()
      params.signal?.throwIfAborted()
      return impact
    } catch (cause) {
      params.signal?.throwIfAborted()
      if (!shouldRetrySubnameMigrationImpact({ failureCount, cause }))
        throw cause
      await waitForRetry(
        getSubnameMigrationImpactRetryDelay(failureCount),
        params.signal,
      )
      return attempt(failureCount + 1)
    }
  }
  return attempt(0)
}
