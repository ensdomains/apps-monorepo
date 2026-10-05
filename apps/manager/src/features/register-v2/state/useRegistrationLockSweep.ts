import { useEffect } from 'react'
import { releaseHolderLocksWhenSettled } from '../service/registrationLock'

/**
 * Free the wallet claims this tab is still carrying, on the way in and out.
 *
 * A flow that has just mounted cannot be mid-registration, so a claim left by
 * a reload or a route change is stale and would only block the user. Both
 * sweeps wait on the tab's identity: a duplicated tab inherits the holder id
 * of the tab it was cloned from, and sweeping on that id would free a claim
 * that is very much alive.
 */
export const useRegistrationLockSweep = (): void => {
  useEffect(() => {
    void releaseHolderLocksWhenSettled()

    return () => {
      void releaseHolderLocksWhenSettled()
    }
  }, [])
}
