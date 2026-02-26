import type {
  RegistrationMachineActor,
  RegistrationMachineState,
} from '@ens-apps/transaction-manager'
import { useBlocker } from '@tanstack/react-router'
import { useSelector } from '@xstate/react'
import { CheckCircle2, Info } from 'lucide-react'
import { match } from 'ts-pattern'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { TransactionErrorAlert } from '@/features/registry/components/TransactionErrorAlert'
import { getTransactionErrorInfo } from '@/features/registry/utils/transactionErrorMessage'
import { usePreventUnload } from '@/hooks/usePreventUnload'

type RegistrationProgressProps = {
  readonly domainName: string
  readonly actor: RegistrationMachineActor
  readonly onViewProfile: () => void | Promise<void>
  readonly isViewProfileLoading: boolean
}

type ProgressStage =
  | 'settingUp'
  | 'approving'
  | 'registering'
  | 'complete'
  | 'error'

function mapStateToProgressStage(
  stateValue: RegistrationMachineState | Record<string, unknown>,
): ProgressStage {
  if (typeof stateValue === 'object' && 'error' in stateValue) {
    return 'error'
  }

  switch (stateValue) {
    case 'settingUpRegistration':
    case 'deployingResolver':
    case 'waitingForResolverDeployment':
    case 'preparingCommitment':
    case 'committingTransaction':
    case 'waitingForCommitment':
    case 'commitmentCooldown':
    case 'validatingCommitment':
      return 'settingUp'
    case 'approvingToken':
    case 'waitingForApproval':
      return 'approving'
    case 'registeringDomain':
    case 'waitingForRegistration':
      return 'registering'
    case 'success':
      return 'complete'
    case 'error':
      return 'error'
    default:
      return 'settingUp'
  }
}

const STAGE_PROGRESS: Record<ProgressStage, number> = {
  settingUp: 33,
  approving: 66,
  registering: 80,
  complete: 100,
  error: 0,
}

const STATE_MESSAGES: Record<
  RegistrationMachineState,
  { primary: string; description: string }
> = {
  idle: { primary: 'Setting up', description: 'Please wait...' },
  error: { primary: 'Registration failed', description: 'Please try again.' },
  settingUpRegistration: {
    primary: 'Setting up',
    description: 'Preparing your name.',
  },
  deployingResolver: {
    primary: 'Getting your name ready',
    description: 'Please wait...',
  },
  waitingForResolverDeployment: {
    primary: 'Confirming',
    description: 'This usually takes a moment.',
  },
  preparingCommitment: {
    primary: 'Preparing',
    description: 'Almost ready for the next step.',
  },
  committingTransaction: {
    primary: 'Check your wallet',
    description: 'Approve the transaction.',
  },
  waitingForCommitment: {
    primary: 'Confirming',
    description: 'Please wait...',
  },
  commitmentCooldown: {
    primary: 'Almost there',
    description: 'Short wait before the next step.',
  },
  validatingCommitment: {
    primary: 'Validating',
    description: 'Almost ready to register.',
  },
  approvingToken: {
    primary: 'Approve payment',
    description: 'Check your wallet.',
  },
  waitingForApproval: {
    primary: 'Confirming payment',
    description: 'Please wait...',
  },
  registeringDomain: {
    primary: 'Registering',
    description: 'Final step — check your wallet.',
  },
  waitingForRegistration: {
    primary: 'Almost complete',
    description: 'Your name will be ready shortly.',
  },
  success: {
    primary: 'Registration complete!',
    description: 'Your name is now active.',
  },
}

export const RegistrationProgress = ({
  domainName,
  actor,
  onViewProfile,
  isViewProfileLoading,
}: RegistrationProgressProps) => {
  const stateValue = useSelector(actor, (state) => state.value)
  const error = useSelector(actor, (state) => state.context.error)

  const progressStage = mapStateToProgressStage(stateValue)

  const isComplete = progressStage === 'complete'
  const isError = progressStage === 'error'

  const isInProgress = !isComplete && !isError

  useBlocker({
    shouldBlockFn: () => {
      if (!isInProgress) return false

      const shouldLeave = confirm(
        'Your registration is in progress. Leaving may interrupt it and you could lose your commitment. Are you sure you want to leave?',
      )
      return !shouldLeave
    },
  })

  usePreventUnload(isInProgress)

  const currentMessage = STATE_MESSAGES[stateValue]

  const progress = STAGE_PROGRESS[progressStage]

  const errorInfo = error ? getTransactionErrorInfo(error) : null

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-border bg-card p-8">
      <div className="flex flex-col items-center gap-6">
        {match({ isComplete, isError })
          .with({ isComplete: true }, () => (
            <Alert variant="success" className="w-full max-w-md">
              <CheckCircle2 aria-hidden />
              <AlertTitle>Registration complete!</AlertTitle>
              <AlertDescription>
                Your ENS domain has been successfully registered and is now
                active.
              </AlertDescription>
            </Alert>
          ))
          .with({ isError: true }, () => (
            <div className="w-full max-w-md">
              <TransactionErrorAlert
                title="Registration failed"
                summary={
                  errorInfo?.summary ??
                  error?.message ??
                  'An error occurred. Please try again.'
                }
                details={errorInfo?.details}
              />
            </div>
          ))
          .otherwise(() => (
            <>
              <div className="flex w-full max-w-md flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-base">
                    {currentMessage.primary}
                  </p>
                  {currentMessage.description && (
                    <p className="text-muted-foreground text-sm">
                      {currentMessage.description}
                    </p>
                  )}
                </div>
                <Progress
                  value={progress}
                  className="h-2"
                  indicatorClassName="animate-pulse"
                />
              </div>
            </>
          ))}

        <h3 className="text-2xl font-bold" title={domainName}>
          {domainName}
        </h3>

        {isInProgress && (
          <Alert variant="warning" className="w-full max-w-md">
            <Info className="size-4" />
            <AlertTitle>Please stay on this page</AlertTitle>
            <AlertDescription>
              Do not refresh or exit this page. Your registration is in
              progress. Closing or refreshing may interrupt the process.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          {match({ isComplete, isError })
            .with({ isComplete: true }, () => (
              <Button
                onClick={onViewProfile}
                className="min-w-32"
                disabled={isViewProfileLoading}
              >
                {isViewProfileLoading ? 'Loading...' : 'View profile'}
              </Button>
            ))
            .with({ isError: true }, () => (
              <>
                <Button
                  variant="outline"
                  onClick={() => actor.send({ type: 'RETRY' })}
                  className="min-w-32"
                >
                  Try again
                </Button>
                <Button
                  variant="outline"
                  onClick={() => actor.send({ type: 'CANCEL' })}
                  className="min-w-32"
                >
                  Go back
                </Button>
              </>
            ))
            .otherwise(
              () =>
                progressStage === 'settingUp' && (
                  <Button
                    variant="ghost"
                    onClick={() => actor.send({ type: 'CANCEL' })}
                    className="min-w-32 text-muted-foreground"
                  >
                    Cancel
                  </Button>
                ),
            )}
        </div>
      </div>
    </div>
  )
}
