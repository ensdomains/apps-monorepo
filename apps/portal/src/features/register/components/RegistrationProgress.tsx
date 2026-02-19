import type { registrationMachine } from '@ens-apps/transaction-manager'
import { useSelector } from '@xstate/react'
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react'
import { match } from 'ts-pattern'
import type { ActorRefFrom } from 'xstate'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type RegistrationProgressProps = {
  readonly domainName: string
  readonly actor: ActorRefFrom<typeof registrationMachine>
  readonly onViewProfile: () => void
}

type ProgressStage =
  | 'settingUp'
  | 'approving'
  | 'registering'
  | 'complete'
  | 'error'

function mapStateToProgressStage(
  stateValue: string | Record<string, unknown>,
): ProgressStage {
  if (typeof stateValue === 'object' && 'error' in stateValue) {
    return 'error'
  }
  const state = String(stateValue)
  switch (state) {
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
  registering: 100,
  complete: 100,
  error: 0,
}

const STATE_MESSAGES: Record<
  string,
  { primary: string; description?: string }[]
> = {
  settingUpRegistration: [
    {
      primary: 'Setting up registration',
      description:
        'Preparing your ENS name. ENS names make crypto addresses human-readable.',
    },
  ],
  deployingResolver: [
    {
      primary: 'Deploying resolver',
      description:
        'Setting up a dedicated resolver for your name. ENS names are stored on-chain as NFTs.',
    },
  ],
  waitingForResolverDeployment: [
    {
      primary: 'Waiting for resolver deployment',
      description:
        'Confirming on-chain. Over 2 million ENS names have been registered.',
    },
  ],
  preparingCommitment: [
    {
      primary: 'Preparing commitment',
      description:
        'Commit-reveal prevents front-running and ensures fair registration.',
    },
  ],
  committingTransaction: [
    {
      primary: 'Committing',
      description:
        'Waiting for your wallet signature. ENS names can be up to 255 characters.',
    },
  ],
  waitingForCommitment: [
    {
      primary: 'Confirming commitment',
      description:
        'Transaction is being confirmed. You can set multiple records: ETH, BTC, email.',
    },
  ],
  commitmentCooldown: [
    {
      primary: 'Waiting period',
      description:
        'Brief wait to prevent attacks. Your name works across all EVM-compatible chains.',
    },
  ],
  validatingCommitment: [
    {
      primary: 'Validating commitment',
      description:
        'Almost ready to register. Create unlimited subdomains for free.',
    },
  ],
  approvingToken: [
    {
      primary: 'Approving payment',
      description:
        'Authorizing the registrar to charge. Supports USDC and DAI payments.',
    },
  ],
  waitingForApproval: [
    {
      primary: 'Confirming approval',
      description:
        'Waiting for confirmation. You can transfer your name to any wallet later.',
    },
  ],
  registeringDomain: [
    {
      primary: 'Registering name',
      description:
        'Finalizing registration. Names are permanent and only expire if not renewed.',
    },
  ],
  waitingForRegistration: [
    {
      primary: 'Almost complete',
      description:
        'Your ENS domain will be active shortly. Receive crypto from any chain.',
    },
  ],
  success: [
    {
      primary: 'Registration complete!',
      description:
        'Your ENS domain has been successfully registered and is now active.',
    },
  ],
}

const DEFAULT_MESSAGE = {
  primary: 'Setting up registration',
  description: 'Preparing your ENS name. Please wait...',
}

export const RegistrationProgress = ({
  domainName,
  actor,
  onViewProfile,
}: RegistrationProgressProps) => {
  const stateValue = useSelector(actor, (state) => state.value)
  const error = useSelector(actor, (state) => state.context.error)

  const progressStage = mapStateToProgressStage(stateValue)
  const machineState = typeof stateValue === 'string' ? stateValue : 'error'

  const messages = STATE_MESSAGES[machineState] ?? [DEFAULT_MESSAGE]
  const currentMessage = messages[0]

  const isComplete = stateValue === 'success'
  const isError = typeof stateValue === 'object' && 'error' in stateValue
  const isInProgress = !isComplete && !isError

  const progress = STAGE_PROGRESS[progressStage]

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-border bg-card p-8">
      {isInProgress && (
        <Alert variant="warning">
          <Info className="size-4" />
          <AlertTitle>Please stay on this page</AlertTitle>
          <AlertDescription>
            Do not refresh or exit this page. Your registration is in progress.
            Closing or refreshing may interrupt the process.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col items-center gap-6">
        {match({ isComplete, isError })
          .with({ isComplete: true }, () => (
            <div className="flex w-full max-w-md items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900/50 dark:bg-green-950/30">
              <CheckCircle2
                aria-hidden
                className="size-5 shrink-0 text-green-600 dark:text-green-500"
              />
              <div className="flex flex-col gap-1">
                <p className="font-medium text-green-800 text-sm dark:text-green-200">
                  Registration complete!
                </p>
                <p className="text-green-700 text-sm dark:text-green-300">
                  Your ENS domain has been successfully registered and is now
                  active.
                </p>
              </div>
            </div>
          ))
          .with({ isError: true }, () => (
            <div className="flex w-full max-w-md items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <AlertCircle
                aria-hidden
                className="size-5 shrink-0 text-destructive"
              />
              <div className="flex flex-col gap-1">
                <p className="font-medium text-destructive text-sm">
                  Registration failed
                </p>
                <p className="text-destructive/90 text-sm">
                  {error?.message ?? 'An error occurred. Please try again.'}
                </p>
              </div>
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
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'absolute h-full rounded-l-full bg-primary transition-all duration-500 ease-out',
                    )}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <Loader2
                aria-hidden
                className="size-12 animate-spin text-primary"
              />
            </>
          ))}

        <p className="text-muted-foreground text-sm" title={domainName}>
          {domainName}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          {match({ isComplete, isError })
            .with({ isComplete: true }, () => (
              <Button onClick={onViewProfile} className="min-w-32">
                View profile
              </Button>
            ))
            .with({ isError: true }, () => (
              <Button
                variant="outline"
                onClick={() => actor.send({ type: 'RETRY' })}
                className="min-w-32"
              >
                Try again
              </Button>
            ))
            .otherwise(() => null)}
        </div>
      </div>
    </div>
  )
}
