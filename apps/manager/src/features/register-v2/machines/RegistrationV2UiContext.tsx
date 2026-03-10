import type { registrationMachine } from '@ens-apps/transaction-manager'
import { useActorRef, useSelector } from '@xstate/react'
import { createContext, useContext } from 'react'
import type { Actor, ActorRefFrom, SnapshotFrom } from 'xstate'
import {
  getRegistrationV2ChildActor,
  registrationV2UiMachine,
} from './registrationV2UiMachine'

const RegistrationV2UiContext2 = createContext<{
  uiActor: Actor<typeof registrationV2UiMachine>
  registrationActor: ActorRefFrom<typeof registrationMachine> | undefined
} | null>(null)

export const RegistrationV2UiProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const registrationV2UiActor = useActorRef(registrationV2UiMachine)
  const registrationActor = useSelector(
    registrationV2UiActor,
    getRegistrationV2ChildActor,
  )

  return (
    <RegistrationV2UiContext2.Provider
      value={{
        uiActor: registrationV2UiActor,
        registrationActor: registrationActor,
      }}
    >
      {children}
    </RegistrationV2UiContext2.Provider>
  )
}

export const useRegistrationV2Context = () => {
  const context = useContext(RegistrationV2UiContext2)
  if (!context) {
    throw new Error('You used a hook outside of the RegistrationV2Context')
  }
  return context
}

export const useRegistrationV2Selector = <T,>(
  selector: (snapshot: SnapshotFrom<typeof registrationV2UiMachine>) => T,
  compare?: (a: T, b: T) => boolean,
) => {
  const { uiActor } = useRegistrationV2Context()
  return useSelector(uiActor, selector, compare)
}

export const useRegistrationV2TransactionSelector = <T,>(
  selector: (
    snapshot?: SnapshotFrom<NonNullable<typeof registrationMachine>>,
  ) => T,
  compare?: (a: T, b: T) => boolean,
) => {
  const { registrationActor } = useRegistrationV2Context()

  return useSelector(registrationActor, selector, compare)
}
