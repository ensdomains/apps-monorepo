import type { registrationMachine } from '@ens-apps/transaction-manager'
import { useSelector } from '@xstate/react'
import { Loader2 } from 'lucide-react'
import type { ActorRefFrom } from 'xstate'
import { Button } from '@/components/ui/button'

type RegistrationProgressProps = {
  domainName: string
  actor: ActorRefFrom<typeof registrationMachine>
  onViewProfile: () => void
}

function mapStateToLabel(stateValue: string | Record<string, unknown>): string {
  if (typeof stateValue === 'object' && 'error' in stateValue) {
    return 'Registration failed'
  }

  const state = String(stateValue)
  switch (state) {
    case 'deployingResolver':
    case 'waitingForResolverDeployment':
      return 'Deploying resolver...'
    case 'preparingCommitment':
    case 'committingTransaction':
    case 'waitingForCommitment':
      return 'Committing...'
    case 'commitmentCooldown':
    case 'validatingCommitment':
      return 'Validating commitment...'
    case 'approvingToken':
    case 'waitingForApproval':
      return 'Approving token...'
    case 'registeringDomain':
    case 'waitingForRegistration':
      return 'Registering name...'
    case 'success':
      return 'Registration complete!'
    case 'error':
      return 'Registration failed'
    default:
      return 'Setting up...'
  }
}

export const RegistrationProgress = ({
  domainName,
  actor,
  onViewProfile,
}: RegistrationProgressProps) => {
  const stateValue = useSelector(actor, (state) => state.value)
  const error = useSelector(actor, (state) => state.context.error)
  const isComplete = stateValue === 'success'
  const isError = typeof stateValue === 'object' && 'error' in stateValue

  const label = mapStateToLabel(stateValue)

  return (
    <div className="flex flex-col items-center gap-6 rounded-lg border border-border bg-card p-8">
      {!isComplete && !isError && (
        <Loader2 className="size-12 animate-spin text-primary" />
      )}
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground text-sm" title={domainName}>
          {domainName.length > 20 ? `${domainName.slice(0, 20)}…` : domainName}
        </p>
      </div>
      {error && (
        <p className="text-destructive text-sm text-center max-w-md">
          {error.message}
        </p>
      )}
      {isComplete && <Button onClick={onViewProfile}>View profile</Button>}
      {isError && (
        <Button variant="outline" onClick={() => actor.send({ type: 'RETRY' })}>
          Try again
        </Button>
      )}
    </div>
  )
}
