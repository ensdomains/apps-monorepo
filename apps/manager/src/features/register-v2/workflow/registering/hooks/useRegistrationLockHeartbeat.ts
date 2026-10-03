import { useEffect } from 'react'
import type { Address } from 'viem'
import {
  REGISTRATION_LOCK_REFRESH_MS,
  refreshRegistrationLock,
} from '../../../service/registrationLock'

/**
 * Hold this wallet's registration lock while the flow is on screen.
 *
 * The lock goes stale on its own once the refreshes stop, so a tab that is
 * closed or crashes frees the wallet without needing a release to run.
 */
export const useRegistrationLockHeartbeat = (
  owner: Address | undefined,
  name: string | undefined,
): void => {
  useEffect(() => {
    if (!owner || !name) return

    refreshRegistrationLock(owner, name)
    const interval = setInterval(
      () => refreshRegistrationLock(owner, name),
      REGISTRATION_LOCK_REFRESH_MS,
    )

    return () => clearInterval(interval)
  }, [owner, name])
}
