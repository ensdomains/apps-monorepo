import type { RegistrationMachineActor } from '@ens-apps/transaction-manager'
import { useEffect } from 'react'
import { subscribePendingL2Bridge } from '../service/pendingL2Bridge'

/**
 * Keep the run's L2 bridge in storage until it settles. Not gated on resume:
 * a cancelled run's payment must be waited for anyway.
 */
export const usePendingL2BridgePersistence = (
  registrationActor: RegistrationMachineActor | undefined,
): void => {
  useEffect(
    () =>
      registrationActor
        ? subscribePendingL2Bridge(registrationActor)
        : undefined,
    [registrationActor],
  )
}
