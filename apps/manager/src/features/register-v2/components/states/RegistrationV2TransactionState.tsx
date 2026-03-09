import { useSelector } from '@xstate/react'
import { RegistrationV2UiContext } from '@/features/register-v2/machines/RegistrationV2UiContext'
import { getRegistrationV2ChildActor } from '@/features/register-v2/machines/registrationV2UiMachine'

interface RegistrationV2TransactionStateProps {
  targetName: string
}

export const RegistrationV2TransactionState = ({
  targetName,
}: RegistrationV2TransactionStateProps) => {
  const uiActorRef = RegistrationV2UiContext.useActorRef()
  const registrationActor = getRegistrationV2ChildActor(uiActorRef.getSnapshot())

  if (!registrationActor) {
    throw new Error('Registration v2 child actor is not available')
  }

  const actorState = useSelector(
    registrationActor,
    (state) => String(state.value),
  )

  return (
    <section className="space-y-4 rounded border p-4">
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
        transaction
      </p>
      <h1 className="font-semibold text-2xl">{targetName}</h1>
      <div className="space-y-2 rounded bg-muted p-3">
        <p className="font-medium text-sm">Current registration actor state</p>
        <code className="block text-sm">{actorState}</code>
      </div>
      <p className="text-sm text-muted-foreground">
        This placeholder is where v2 will expose exact registration workflow
        stages instead of a generic waiting screen.
      </p>
    </section>
  )
}
