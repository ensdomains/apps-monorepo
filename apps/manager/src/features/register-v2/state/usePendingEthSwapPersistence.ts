import type { RegistrationMachineActor } from '@ens-apps/transaction-manager'
import { useEffect } from 'react'
import { subscribePendingEthSwap } from '../service/pendingEthSwap'

/** Keep the run's ETH swap in storage until it is counted, cancelled runs included. */
export const usePendingEthSwapPersistence = (
  registrationActor: RegistrationMachineActor | undefined,
): void => {
  useEffect(
    () =>
      registrationActor
        ? subscribePendingEthSwap(registrationActor)
        : undefined,
    [registrationActor],
  )
}
