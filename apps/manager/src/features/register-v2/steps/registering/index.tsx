import { transactionManager } from '@ens-apps/transaction-manager'
import { useBlocker } from '@tanstack/react-router'
import { useSelector } from '@xstate/react'
import { CheckCircle2 } from 'lucide-react'
import { match, P } from 'ts-pattern'
import { RegisterV2Context } from '../../machines/RegistrationV2UiContext'
import { NotificationSettings } from './NotificationSettings'
import { RegistrationDetails } from './RegistrationDetails'

const useRegisteringTx = RegisterV2Context.createTxSelector((state) => ({
  value: state?.value ?? 'idle',
  resolverTxId: state?.context.resolverTxId,
  commitmentTxId: state?.context.commitmentTxId,
  approvalTxId: state?.context.approvalTxId,
  registrationTxId: state?.context.registrationTxId,
}))

type RegisteringTx = ReturnType<typeof useRegisteringTx>

const getRegistrationStageMessages = (
  tx: RegisteringTx,
  txState: TransactionState,
) =>
  match({ stage: tx.value, txState })
    .returnType<{
      stageLabel: string
      stageDescription?: string
      progress: number
    }>()

    .with({ stage: 'idle' }, () => ({
      stageLabel: 'Idle',
      stageDescription: 'The registration flow is idle',
      progress: 0,
    }))
    .with({ stage: 'deployingResolver' }, () => ({
      stageLabel: 'Deploying resolver',
      stageDescription: 'Deploying the resolver',
      progress: 8,
    }))
    // Waiting on wallet to send transaction
    .with(
      { stage: 'waitingForResolverDeployment', txState: 'submitting' },
      () => ({
        stageLabel: 'Waiting for resolver submission',
        progress: 10,
      }),
    )
    // Waiting on tx receipt
    .with(
      { stage: 'waitingForResolverDeployment', txState: 'pending' },
      () => ({
        stageLabel: 'Waiting for resolver deployment',
        stageDescription: 'Waiting for the resolver deployment',
        progress: 15,
      }),
    )
    .with({ stage: 'preparingCommitment' }, () => ({
      stageLabel: 'Preparing commitment',
      stageDescription: 'Preparing the commitment',
      progress: 23,
    }))
    .with({ stage: 'committingTransaction' }, () => ({
      stageLabel: 'Submitting commitment transaction',
      stageDescription: 'Submitting the commitment transaction',
      progress: 31,
    }))
    .with({ stage: 'waitingForCommitment', txState: 'submitting' }, () => ({
      stageLabel: 'Waiting for commitment submission',
      progress: 31,
    }))
    // Waiting on tx receipt
    .with({ stage: 'waitingForCommitment', txState: 'pending' }, () => ({
      stageLabel: 'Waiting for commitment receipt',
      progress: 35,
    }))
    .with({ stage: 'waitingForCommitment' }, () => ({
      stageLabel: 'Waiting for commitment confirmation',
      stageDescription: 'Waiting for the commitment confirmation',
      progress: 38,
    }))
    .with({ stage: 'validatingCommitment' }, () => ({
      stageLabel: 'Validating commitment',
      stageDescription: 'Validating the commitment',
      progress: 46,
    }))
    .with({ stage: 'approvingToken' }, () => ({
      stageLabel: 'Approving payment token',
      stageDescription: 'Approving the payment token',
      progress: 54,
    }))
    .with({ stage: 'waitingForApproval' }, () => ({
      stageLabel: 'Waiting for approval confirmation',
      stageDescription: 'Waiting for the approval confirmation',
      progress: 62,
    }))
    .with({ stage: 'registeringDomain' }, () => ({
      stageLabel: 'Submitting registration transaction',
      stageDescription: 'Submitting the registration transaction',
      progress: 77,
    }))
    .with({ stage: 'waitingForRegistration' }, () => ({
      stageLabel: 'Waiting for registration confirmation',
      stageDescription: 'Waiting for the registration confirmation',
      progress: 90,
    }))
    .with({ stage: 'success' }, () => ({
      stageLabel: 'Registration complete',
      stageDescription: 'Registration complete',
      progress: 100,
    }))
    .with({ stage: 'error' }, () => ({
      stageLabel: 'Registration failed',
      stageDescription: 'Registration failed',
      progress: 0,
    }))
    .otherwise(() => ({
      stageLabel: 'Registration in progress',
      stageDescription: 'Registration in progress',
      progress: 0,
    }))

const getRegistrationTxHash = (tx: RegisteringTx) =>
  match(tx.value)
    .with('waitingForResolverDeployment', () => tx.resolverTxId)
    .with('waitingForCommitment', () => tx.commitmentTxId)
    .with('waitingForApproval', () => tx.approvalTxId)
    .with('waitingForRegistration', () => tx.registrationTxId)
    .otherwise(() => undefined)

const useUiStage = RegisterV2Context.createSelector((state) =>
  match(state.value)
    .with({ registering: P.any }, (step) => step.registering)
    .otherwise(() => undefined),
)

const ProgressBar = ({
  label,
  description,
  progress,
}: {
  label: string
  description?: string
  progress: number
}) => {
  return (
    <div className="mt-1 flex flex-col gap-1">
      <div className="relative min-h-14 sm:min-h-12">
        <div
          className={'absolute inset-0 transition-all duration-300 ease-in-out'}
        >
          <p className="font-medium text-base text-ens-blue">{label}</p>
          {description && (
            <p className="text-ens-gray text-sm">{description}</p>
          )}
        </div>
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-full bg-ens-gray-two">
        <div
          className="absolute h-full rounded-l-full bg-ens-blue transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute inset-0 animate-shimmer bg-linear-to-r from-transparent via-white/20 to-transparent" />
        </div>
      </div>
    </div>
  )
}

const useTransactionState = (registeringTx: RegisteringTx) => {
  const txHash = getRegistrationTxHash(registeringTx)
  const txMachine = txHash
    ? transactionManager.getTransaction(txHash)
    : undefined

  const txState = useSelector(txMachine, (s) =>
    match(s?.value)
      .with(P.string, (val) => val)
      .with({ error: P.any }, () => 'error' as const)
      .with(undefined, () => undefined)
      .exhaustive(),
  )

  return txState
}
type TransactionState = ReturnType<typeof useTransactionState>

export function RegisteringStep() {
  const { registrationActor, uiActor } = RegisterV2Context.use()
  const registeringTx = useRegisteringTx(registrationActor)
  const uiStage = useUiStage(uiActor)
  const txState = useTransactionState(registeringTx)
  const stageMessages = getRegistrationStageMessages(registeringTx, txState)

  useBlocker({
    shouldBlockFn: () => {
      if (uiStage?.transaction !== 'pending') {
        return false
      }

      const shouldLeave = confirm(
        'Your registration is in progress. Leaving may interrupt it. Are you sure you want to leave?',
      )

      return !shouldLeave
    },
  })

  return (
    <>
      {match(uiStage?.transaction)
        .with('pending', () => (
          <ProgressBar
            description={stageMessages.stageDescription}
            label={stageMessages.stageLabel}
            progress={stageMessages.progress}
          />
        ))
        .with('success', () => (
          <div className="flex items-start gap-3 rounded-lg border border-ens-peridot-border bg-ens-peridot-bg p-4">
            <CheckCircle2
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-ens-peridot-text-dark"
            />
            <div className="flex flex-col gap-1">
              <p className="font-medium text-ens-peridot-text-dark text-sm leading-5">
                Registration Complete!
              </p>
              <p className="text-ens-peridot-text-medium text-sm leading-5">
                Your ENS domain has been successfully registered and is now
                active.
              </p>
            </div>
          </div>
        ))
        .with(undefined, () => (
          <ProgressBar label={'Loading...'} progress={0} />
        ))
        .exhaustive()}
      {match(uiStage)
        .with({ notifications: 'settings' }, () => (
          <NotificationSettings
            onConfirm={() => {
              uiActor.send({ type: 'notifications.step.next' })
            }}
            onSkip={() => {
              uiActor.send({ type: 'notifications.step.next' })
            }}
          />
        ))
        .with({ transaction: P.string }, () => <RegistrationDetails />)
        .otherwise(() => null)}
    </>
  )
}
