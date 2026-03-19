import type {
  RegistrationMachineActor,
  RegistrationMachineState,
} from '@ens-apps/transaction-manager'
import { useQuery } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { useSelector } from '@xstate/react'
import { CheckCircle2 } from 'lucide-react'
import { Fragment } from 'react'
import { match } from 'ts-pattern'
import { useConnection } from 'wagmi'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { getRegistrationPriceQueryOptions } from '@/features/register/hooks/useRegistrationPrice'
import { isPriceResult } from '@/features/register/utils/registrationPrice'
import { TransactionErrorAlert } from '@/features/registry/components/TransactionErrorAlert'
import { getTransactionErrorInfo } from '@/features/registry/utils/transactionErrorMessage'
import { usePreventUnload } from '@/hooks/usePreventUnload'
import { RegistrationSuccess } from './RegistrationSuccess'

type RegistrationProgressProps = {
  readonly domainName: string
  readonly actor: RegistrationMachineActor
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
  idle: {
    primary: 'Initializing',
    description: 'Loading registration flow...',
  },
  error: {
    primary: 'Registration failed',
    description: 'An error occurred. You can try again or go back.',
  },
  settingUpRegistration: {
    primary: 'Initializing registration',
    description: 'Preparing registration parameters and checking availability.',
  },
  deployingResolver: {
    primary: 'Deploying resolver',
    description: 'Creating your resolver contract on-chain.',
  },
  waitingForResolverDeployment: {
    primary: 'Confirming resolver deployment',
    description:
      'Waiting for the resolver deployment transaction to confirm on-chain.',
  },
  preparingCommitment: {
    primary: 'Preparing commitment',
    description:
      'Generating commitment hash for the commit-reveal registration.',
  },
  committingTransaction: {
    primary: 'Sign commitment transaction',
    description:
      'Approve the commitment transaction in your wallet. This hides your registration intent on-chain.',
  },
  waitingForCommitment: {
    primary: 'Confirming commitment',
    description: 'Waiting for the commitment transaction to confirm on-chain.',
  },
  commitmentCooldown: {
    primary: 'Commitment cooldown',
    description:
      'Waiting 60 seconds before reveal (ENS commit-reveal security requirement).',
  },
  validatingCommitment: {
    primary: 'Validating commitment',
    description: 'Verifying commitment is ready for the reveal step.',
  },
  approvingToken: {
    primary: 'Approve payment token',
    description:
      'Approve token spending allowance in your wallet for the registration fee.',
  },
  waitingForApproval: {
    primary: 'Confirming token approval',
    description:
      'Waiting for the token approval transaction to confirm on-chain.',
  },
  registeringDomain: {
    primary: 'Register domain',
    description: 'Approve the final registration transaction in your wallet.',
  },
  waitingForRegistration: {
    primary: 'Confirming registration',
    description:
      'Waiting for the registration transaction to confirm on-chain.',
  },
  success: {
    primary: 'Registration complete',
    description:
      'Your ENS name has been registered and is now active on-chain.',
  },
}

export const RegistrationProgress = ({
  domainName,
  actor,
}: RegistrationProgressProps) => {
  const { address } = useConnection()

  const stateValue = useSelector(actor, (state) => state.value)
  const duration = useSelector(actor, (state) => state.context.duration)
  const error = useSelector(actor, (state) => state.context.error)
  const selectedToken = useSelector(
    actor,
    (state) => state.context.selectedToken,
  )
  const tokenPrice = useSelector(actor, (state) => state.context.tokenPrice)

  const durationSeconds = duration ? Number(duration) : 365 * 24 * 60 * 60
  const isComplete = stateValue === 'success'

  const { data: price } = useQuery({
    ...getRegistrationPriceQueryOptions({
      name: domainName,
      duration: durationSeconds,
      owner: address,
    }),
    enabled:
      isComplete &&
      Boolean(domainName) &&
      durationSeconds > 0 &&
      Boolean(address),
  })

  const progressStage = mapStateToProgressStage(stateValue)
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

  if (progress === 100 && isComplete && isPriceResult(price)) {
    return (
      <RegistrationSuccess
        domainName={domainName}
        durationSeconds={durationSeconds}
        price={price}
        tokenPrice={tokenPrice}
        selectedToken={selectedToken}
      />
    )
  }

  return (
    <Fragment>
      <h3 className="text-3xl font-medium" title={domainName}>
        Registering {domainName}
      </h3>

      {progress ? (
        <Progress
          value={progress}
          className="h-6"
          indicatorClassName="animate-pulse"
        />
      ) : null}

      <div className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col items-center gap-6">
          {match({ isComplete, isError })
            .with({ isComplete: true }, () => (
              <Alert variant="success" className="w-full">
                <CheckCircle2 aria-hidden />
                <AlertTitle>Registration complete!</AlertTitle>
                <AlertDescription>
                  Your ENS domain has been successfully registered and is now
                  active.
                </AlertDescription>
              </Alert>
            ))
            .with({ isError: true }, () => (
              <div className="w-full">
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
                <div className="flex w-full flex-col gap-3">
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
                </div>
              </>
            ))}

          {isInProgress && (
            <Alert variant="warning" className="w-full text-center p-4">
              <AlertDescription>
                Do not refresh or edit this page. Your registration is in
                progress and will complete shortly. Closing or refreshing may
                interrupt the process.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            {match({ isError })
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
                      className="min-w-32 text-danger hover:text-danger/80"
                    >
                      Cancel Registration
                    </Button>
                  ),
              )}
          </div>
        </div>
      </div>
    </Fragment>
  )
}
