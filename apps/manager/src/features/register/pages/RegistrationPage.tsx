import { registrationMachine } from '@ens-apps/transaction-manager'
import { useNavigate } from '@tanstack/react-router'
import { useActorRef, useSelector } from '@xstate/react'
import { useReducer } from 'react'
import { Button } from '@/components/ui/button'
import { useRhinestoneAccount } from '@/lib/rhinestone/useRhinestoneAccount'
import { publicClient } from '@/lib/wagmi'
import { ApprovalInProgress } from '../components/ApprovalInProgress'
import { Autorenewal } from '../components/Autorenewal'
import { PaymentInProgress } from '../components/PaymentInProgress'
import { Pricing } from '../components/Pricing'
import { RegistrationInProgress } from '../components/RegistrationInProgress'
import { RegistrationSuccess } from '../components/RegistrationSuccess'
import { useUpdateAccountOnReady } from '../hooks/useUpdateAccountOnReady'
import { handleStartRegistration } from './RegistrationPage.handlers'
import {
  createInitialUIState,
  registrationUIReducer,
} from './RegistrationPage.reducer'

// ============================================================================
// TYPES
// ============================================================================

export enum RegistrationStep {
  PRICING = 'pricing',
  COMMITTING = 'committing',
  APPROVING = 'approving',
  REGISTERING = 'registering',
  SUCCESS = 'success',
  AUTORENEWAL = 'autorenewal',
  ERROR = 'error',
}

interface RegistrationProps {
  initialName?: string
}

// ============================================================================
// HELPER: Map machine state to RegistrationStep
// ============================================================================

function mapMachineStateToStep(machineState: string): RegistrationStep {
  switch (machineState) {
    case 'idle':
      return RegistrationStep.PRICING
    case 'preparingCommitment':
    case 'committingTransaction':
    case 'waitingForCommitment':
      return RegistrationStep.COMMITTING
    case 'approvingToken':
    case 'waitingForApproval':
      return RegistrationStep.APPROVING
    case 'registeringDomain':
    case 'waitingForRegistration':
      return RegistrationStep.REGISTERING
    case 'success':
      return RegistrationStep.SUCCESS
    case 'error':
      return RegistrationStep.ERROR
    default:
      return RegistrationStep.PRICING
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function Registration({ initialName }: RegistrationProps) {
  const navigate = useNavigate()

  // Machine actor
  const actor = useActorRef(registrationMachine, {
    input: {
      chainId: 11155111, // Sepolia
    },
  })

  // Account state
  const { rhinestoneAccount, accountAddress, isConnected, rhinestoneConfig } =
    useRhinestoneAccount()

  // Sync account to machine when ready
  useUpdateAccountOnReady(actor, {
    rhinestoneAccount,
    accountAddress,
    rhinestoneConfig,
    publicClient,
  })

  // Local UI state
  const [ui, dispatch] = useReducer(
    registrationUIReducer,
    createInitialUIState(initialName),
  )

  // Selectors - directly select from machine state
  const isAccountReady = Boolean(
    rhinestoneAccount && accountAddress && rhinestoneConfig,
  )

  const step = useSelector(actor, (state) => {
    if (!isAccountReady) return RegistrationStep.PRICING
    return mapMachineStateToStep(String(state.value))
  })

  const domainName = useSelector(
    actor,
    (state) => state.context.name || ui.name,
  )

  const error = useSelector(
    actor,
    (state) => state.context.error?.message || null,
  )

  const commitTxId = useSelector(actor, (state) => state.context.commitmentTxId)

  const registerTxId = useSelector(
    actor,
    (state) => state.context.registrationTxId,
  )

  // Derived state
  const commitTxHash = commitTxId ? { hash: commitTxId as `0x${string}` } : null
  const registerTxHash = registerTxId
    ? { hash: registerTxId as `0x${string}` }
    : null
  const isCommitPending = step === RegistrationStep.COMMITTING
  const isApprovePending = step === RegistrationStep.APPROVING
  const isRegisterPending = step === RegistrationStep.REGISTERING

  // Handlers
  const handleBack = () => {
    if (step === RegistrationStep.PRICING) {
      navigate({ to: '/' })
    } else if (
      step === RegistrationStep.APPROVING ||
      step === RegistrationStep.REGISTERING
    ) {
      // Don't allow going back during transactions
      return
    } else {
      // All other steps go to pricing on 'back'
      actor.send({ type: 'CANCEL' })
      dispatch({ type: 'RESET', initialName })
    }
  }

  const handleSetDuration = (newDuration: number) => {
    dispatch({ type: 'SET_DURATION', duration: newDuration })
  }

  const handleSelectPayment = (_method: 'crypto' | 'credit-card') => {
    // No-op for now - handled by payment drawer
  }

  const handleSelectCrypto = (_cryptoId: string) => {
    // No-op for now - handled by payment drawer
  }

  const handleConfirmPayment = (tokenPrice: bigint, selectedToken: string) => {
    handleStartRegistration(
      {
        name: ui.name,
        duration: ui.duration,
        selectedToken: selectedToken as `0x${string}`,
        tokenPrice,
      },
      {
        rhinestoneAccount,
        accountAddress,
      },
      {
        onSuccess: (event) => actor.send(event),
        onError: (message) => alert(message),
      },
    )
  }

  const handlePaymentSuccess = () => {
    // Payment success is handled automatically by the state machine
  }

  const handleRetry = () => {
    actor.send({ type: 'RETRY' })
  }

  const handleReset = () => {
    actor.send({ type: 'CANCEL' })
    dispatch({ type: 'RESET', initialName })
  }

  const handleSetupAutorenewal = () => {
    // TODO: Implement autorenewal flow
  }

  const displayDomainName = domainName || ''

  return (
    <div className="mx-auto max-w-md">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={handleBack} className="h-auto p-2">
          ← Back
        </Button>
      </div>

      {step === RegistrationStep.PRICING && displayDomainName && (
        <div className="mx-auto max-w-md px-4 py-6">
          <Pricing
            domainName={displayDomainName}
            duration={ui.duration}
            isConnected={isConnected}
            isLoading={isCommitPending || isApprovePending || isRegisterPending}
            onSetDuration={handleSetDuration}
            onSelectPayment={handleSelectPayment}
            onSelectCrypto={handleSelectCrypto}
            onConfirmPayment={handleConfirmPayment}
          />
        </div>
      )}

      {step === RegistrationStep.COMMITTING && (
        <PaymentInProgress
          domainName={displayDomainName}
          selectedCrypto=""
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

      {step === RegistrationStep.APPROVING && (
        <ApprovalInProgress
          domainName={displayDomainName}
          selectedToken={ui.selectedToken}
          commitTxHash={commitTxHash}
        />
      )}

      {step === RegistrationStep.REGISTERING && (
        <RegistrationInProgress
          domainName={displayDomainName}
          onRegistrationSuccess={() => {}} // No-op - handled by state machine
          registerTxHash={registerTxHash}
        />
      )}

      {step === RegistrationStep.SUCCESS && (
        <RegistrationSuccess
          domainName={displayDomainName}
          onSetupAutorenewal={handleSetupAutorenewal}
        />
      )}

      {step === RegistrationStep.AUTORENEWAL && (
        <Autorenewal
          domainName={displayDomainName}
          duration={ui.duration}
          onReset={handleReset}
          onCompleteFlow={handleReset}
        />
      )}

      {step === RegistrationStep.ERROR && (
        <div className="mx-auto max-w-md px-4 py-6">
          <div className="text-center">
            <h2 className="mb-4 font-semibold text-red-600 text-xl">
              Registration Error
            </h2>
            <p className="mb-4 whitespace-pre-line text-gray-600">
              {error || 'There was an error during the registration process.'}
            </p>
            <Button onClick={handleRetry} className="mr-2">
              Retry
            </Button>
            <Button variant="outline" onClick={handleReset}>
              Start Over
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
