import { transactionManager } from '@ens-apps/transaction-manager'
import { useSelector } from '@xstate/react'
import { match } from 'ts-pattern'
import {
  useRegistrationV2Context,
  useRegistrationV2TransactionSelector,
} from '@/features/register-v2/machines/RegistrationV2UiContext'

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

export const RegistrationV2TransactionState = () => {
  const { uiActor, label } = useRegistrationV2Context()
  const targetName = `${label}.eth`

  const actorState = useRegistrationV2TransactionSelector((state) => ({
    value: state?.value ?? 'idle',
    resolverTxId: state?.context.resolverTxId,
    commitmentTxId: state?.context.commitmentTxId,
    approvalTxId: state?.context.approvalTxId,
    registrationTxId: state?.context.registrationTxId,
  }))

  const state = match(actorState.value)
    .returnType<{
      stageLabel: string
      stageDescription: string
      txId?: string
    }>()

    .with('idle', () => ({
      stageLabel: 'Idle',
      stageDescription: 'The registration flow is idle',
    }))

    .with('deployingResolver', () => ({
      stageLabel: 'Deploying resolver',
      stageDescription: 'Deploying the resolver',
    }))
    .with('waitingForResolverDeployment', () => ({
      stageLabel: 'Waiting for resolver deployment',
      stageDescription: 'Waiting for the resolver deployment',
      txId: actorState.resolverTxId,
    }))
    .with('preparingCommitment', () => ({
      stageLabel: 'Preparing commitment',
      stageDescription: 'Preparing the commitment',
    }))
    .with('committingTransaction', () => ({
      stageLabel: 'Submitting commitment transaction',
      stageDescription: 'Submitting the commitment transaction',
    }))
    .with('waitingForCommitment', () => ({
      stageLabel: 'Waiting for commitment confirmation',
      stageDescription: 'Waiting for the commitment confirmation',
      txId: actorState.commitmentTxId,
    }))
    .with('validatingCommitment', () => ({
      stageLabel: 'Validating commitment',
      stageDescription: 'Validating the commitment',
    }))
    .with('approvingToken', () => ({
      stageLabel: 'Approving payment token',
      stageDescription: 'Approving the payment token',
    }))
    .with('waitingForApproval', () => ({
      stageLabel: 'Waiting for approval confirmation',
      stageDescription: 'Waiting for the approval confirmation',
      txId: actorState.approvalTxId,
    }))
    .with('registeringDomain', () => ({
      stageLabel: 'Submitting registration transaction',
      stageDescription: 'Submitting the registration transaction',
    }))
    .with('waitingForRegistration', () => ({
      stageLabel: 'Waiting for registration confirmation',
      stageDescription: 'Waiting for the registration confirmation',
      txId: actorState.registrationTxId,
    }))
    .with('success', () => ({
      stageLabel: 'Registration complete',
      stageDescription: 'Registration complete',
    }))
    .with('error', () => ({
      stageLabel: 'Registration failed',
      stageDescription: 'Registration failed',
    }))
    .otherwise(() => ({
      stageLabel: 'Registration in progress',
      stageDescription: 'Registration in progress',
    }))

  const transactionMachine = state.txId
    ? transactionManager.getTransaction(state.txId)
    : undefined

  const txState = useSelector(transactionMachine, (s) => s?.value)

  return (
    <section className="space-y-4 rounded border p-4">
      <p className="font-mono text-muted-foreground text-xs uppercase tracking-wide">
        transaction
      </p>
      <h1 className="font-semibold text-2xl">{targetName}</h1>
      <p className="font-medium text-sm">{state.stageLabel}</p>
      <div className="space-y-2 rounded bg-muted p-3">
        <p className="font-medium text-sm">Current registration actor state</p>
        <code className="block text-sm">{actorState.value}</code>
      </div>
      <div className="space-y-2 rounded bg-muted p-3">
        <p className="font-medium text-sm">Current transaction state</p>
        <code className="block text-sm">
          {JSON.stringify(txState, null, 2)}
        </code>
      </div>
      <p className="text-muted-foreground text-sm">
        This view exposes the shared registration actor state directly so the
        flow is inspectable while the UI is still minimal.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded border px-3 py-2 text-sm"
          onClick={() => uiActor.send({ type: 'CANCEL' })}
          type="button"
        >
          Cancel flow
        </button>
      </div>
    </section>
  )
}
