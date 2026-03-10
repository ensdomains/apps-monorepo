import { useSelector } from '@xstate/react'
import { RegistrationV2UiContext } from '@/features/register-v2/machines/RegistrationV2UiContext'
import { getRegistrationV2ChildActor } from '@/features/register-v2/machines/registrationV2UiMachine'

interface RegistrationV2TransactionStateProps {
  targetName: string
}

const TRANSACTION_STAGE_LABELS: Record<string, string> = {
  idle: 'Idle',
  settingUpRegistration: 'Setting up registration',
  deployingResolver: 'Deploying resolver',
  waitingForResolverDeployment: 'Waiting for resolver deployment',
  preparingCommitment: 'Preparing commitment',
  committingTransaction: 'Submitting commitment transaction',
  waitingForCommitment: 'Waiting for commitment confirmation',
  commitmentCooldown: 'Waiting for commitment cooldown',
  validatingCommitment: 'Validating commitment',
  approvingToken: 'Approving payment token',
  waitingForApproval: 'Waiting for approval confirmation',
  registeringDomain: 'Submitting registration transaction',
  waitingForRegistration: 'Waiting for registration confirmation',
  success: 'Registration complete',
  error: 'Registration failed',
}

export const RegistrationV2TransactionState = ({
  targetName,
}: RegistrationV2TransactionStateProps) => {
  const uiActorRef = RegistrationV2UiContext.useActorRef()
  const registrationActor = getRegistrationV2ChildActor(
    uiActorRef.getSnapshot(),
  )

  if (!registrationActor) {
    throw new Error('Registration v2 child actor is not available')
  }

  const actorState = useSelector(registrationActor, (state) =>
    String(state.value),
  )
  const stageLabel =
    TRANSACTION_STAGE_LABELS[actorState] ?? 'Registration in progress'

  return (
    <section className="space-y-4 rounded border p-4">
      <p className="font-mono text-muted-foreground text-xs uppercase tracking-wide">
        transaction
      </p>
      <h1 className="font-semibold text-2xl">{targetName}</h1>
      <p className="font-medium text-sm">{stageLabel}</p>
      <div className="space-y-2 rounded bg-muted p-3">
        <p className="font-medium text-sm">Current registration actor state</p>
        <code className="block text-sm">{actorState}</code>
      </div>
      <p className="text-muted-foreground text-sm">
        This view exposes the shared registration actor state directly so the
        flow is inspectable while the UI is still minimal.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded border px-3 py-2 text-sm"
          onClick={() => uiActorRef.send({ type: 'CANCEL' })}
          type="button"
        >
          Cancel flow
        </button>
      </div>
    </section>
  )
}
