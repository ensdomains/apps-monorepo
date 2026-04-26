import { useActorRef, useSelector } from '@xstate/react'
import { createContext, use, useEffect, useRef } from 'react'
import type { Actor, ActorRefFrom, SnapshotFrom } from 'xstate'
import { renewalUiMachine } from './renewalUi.machine'

const RenewalUiContext = createContext<{
  uiActor: Actor<typeof renewalUiMachine>
  label: string
  currentExpiry: bigint
} | null>(null)

export type RenewalUiActor = ActorRefFrom<typeof renewalUiMachine>
export type RenewalUiSnapshot = SnapshotFrom<typeof renewalUiMachine>

export const RenewalUiProvider = ({
  children,
  label,
  currentExpiry,
}: {
  children: React.ReactNode
  label: string
  currentExpiry: bigint
}) => {
  const uiActor = useActorRef(renewalUiMachine, {
    input: { currentExpiry },
  })
  const previousLabel = useRef(label)

  useEffect(() => {
    const subscription = uiActor.subscribe({
      error: (error) => {
        console.error('Renewal UI error:', error)
      },
    })

    return subscription.unsubscribe
  }, [uiActor])

  useEffect(() => {
    if (previousLabel.current === label) {
      return
    }

    previousLabel.current = label
    uiActor.send({ type: 'label.changed' })
  }, [label, uiActor])

  return (
    <RenewalUiContext.Provider value={{ uiActor, label, currentExpiry }}>
      {children}
    </RenewalUiContext.Provider>
  )
}

export const useRenewalUiContext = () => {
  const context = use(RenewalUiContext)
  if (!context) {
    throw new Error('You used a hook outside of the RenewalUiProvider')
  }
  return context
}

export const createRenewalUiSelector =
  <T,>(
    selector: (snapshot: RenewalUiSnapshot) => T,
    compare?: (a: T, b: T) => boolean,
  ) =>
  (uiActor: Actor<typeof renewalUiMachine>) =>
    useSelector(uiActor, selector, compare)

export const useRenewalUiSelector = <T,>(
  selector: (snapshot: RenewalUiSnapshot) => T,
  compare?: (a: T, b: T) => boolean,
) => {
  const { uiActor } = useRenewalUiContext()
  return useSelector(uiActor, selector, compare)
}
