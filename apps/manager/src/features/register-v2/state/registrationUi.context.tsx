import type { registrationMachine } from '@ens-apps/transaction-manager'
import { useActorRef, useSelector } from '@xstate/react'
import { createContext, use, useEffect } from 'react'
import type { Actor, ActorRefFrom, SnapshotFrom } from 'xstate'
import {
  getRegistrationV2ChildActor,
  registrationV2UiMachine,
} from './registrationUi.machine'

const RegistrationV2UiContext2 = createContext<{
  uiActor: Actor<typeof registrationV2UiMachine>
  registrationActor: ActorRefFrom<typeof registrationMachine> | undefined
  /**
   * Label is an ENS name without the .eth suffix and not a subname
   */
  label: string
} | null>(null)

export type RegistrationV2UiActor = ActorRefFrom<typeof registrationV2UiMachine>
export type RegistrationV2UiSnapshot = SnapshotFrom<
  typeof registrationV2UiMachine
>

export const RegistrationV2UiProvider = ({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) => {
  const registrationV2UiActor = useActorRef(registrationV2UiMachine)
  const registrationActor = useSelector(
    registrationV2UiActor,
    getRegistrationV2ChildActor,
  )

  useEffect(() => {
    const subscription = registrationV2UiActor.subscribe({
      error: (error) => {
        console.error('Registration V2 UI error:', error)
      },
    })

    return subscription.unsubscribe
  }, [registrationV2UiActor])

  return (
    <RegistrationV2UiContext2.Provider
      value={{
        uiActor: registrationV2UiActor,
        registrationActor: registrationActor,
        label,
      }}
    >
      {children}
    </RegistrationV2UiContext2.Provider>
  )
}

export const useRegistrationV2Context = () => {
  const context = use(RegistrationV2UiContext2)
  if (!context) {
    throw new Error('You used a hook outside of the RegistrationV2Context')
  }
  return context
}

export const createRegistrationV2UiSelector =
  <T,>(
    selector: (snapshot: RegistrationV2UiSnapshot) => T,
    compare?: (a: T, b: T) => boolean,
  ) =>
  (uiActor: Actor<typeof registrationV2UiMachine>) =>
    useSelector(uiActor, selector, compare)

export const createRegistrationV2TransactionSelector =
  <T,>(
    selector: (
      snapshot?: SnapshotFrom<NonNullable<typeof registrationMachine>>,
    ) => T,
    compare?: (a: T, b: T) => boolean,
  ) =>
  (registrationActor?: ActorRefFrom<typeof registrationMachine>) =>
    useSelector(registrationActor, selector, compare)

export const useRegistrationV2Selector = <T,>(
  selector: (snapshot: RegistrationV2UiSnapshot) => T,
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

export const RegisterV2Context = {
  use: useRegistrationV2Context,
  createSelector: createRegistrationV2UiSelector,
  useSelector: useRegistrationV2Selector,
  createTxSelector: createRegistrationV2TransactionSelector,
  useTxSelector: useRegistrationV2TransactionSelector,
}
