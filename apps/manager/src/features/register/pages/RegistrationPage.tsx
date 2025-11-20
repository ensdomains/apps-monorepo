import { registrationMachine } from '@ens-apps/transaction-manager'
import { useNavigate } from '@tanstack/react-router'
import { useActorRef, useSelector } from '@xstate/react'
import { ArrowLeftIcon } from 'lucide-react'
import { useEffect, useReducer, useState } from 'react'
import type { Address, Hex } from 'viem'
import { sepolia } from 'viem/chains'
import { Button } from '@/components/ui/button'
import { useRhinestoneAccount } from '@/lib/rhinestone/useRhinestoneAccount'
import { publicClient } from '@/lib/wagmi'
import { ApprovalInProgress } from '../components/ApprovalInProgress'
import { Autorenewal } from '../components/Autorenewal'
import { PaymentInProgress } from '../components/PaymentInProgress'
import { Pricing } from '../components/Pricing'
import { RegistrationInProgress } from '../components/RegistrationInProgress'
import { RegistrationSuccess } from '../components/RegistrationSuccess'
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
  initialDuration?: number
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
    case 'commitmentCooldown':
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
      chainId: sepolia.id, // Sepolia
    },
  })

  // Account state
  const { rhinestoneAccount, accountAddress, isConnected, rhinestoneConfig } =
    useRhinestoneAccount()

  // Local UI state
  const [ui, dispatch] = useReducer(
    registrationUIReducer,
    createInitialUIState(initialName),
  )

  // Derived state
  const isAccountReady = Boolean(
    rhinestoneAccount && accountAddress && rhinestoneConfig,
  )

  // Selectors - directly select from machine state
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

  const registerReadyTimestamp = useSelector(
    actor,
    (state) => state.context.registerReadyTimestamp ?? null,
  )

  const [registerWaitSeconds, setRegisterWaitSeconds] = useState<number | null>(
    null,
  )

  useEffect(() => {
    if (!registerReadyTimestamp) {
      setRegisterWaitSeconds(null)
      return
    }

    const updateRemaining = () => {
      const diff = registerReadyTimestamp - Date.now()
      setRegisterWaitSeconds(Math.max(0, Math.ceil(diff / 1000)))
    }

    updateRemaining()
    const interval = setInterval(updateRemaining, 1000)
    return () => clearInterval(interval)
  }, [registerReadyTimestamp])

  // Derived state
  const commitTxHash = commitTxId ? { hash: commitTxId as Hex } : null
  const registerTxHash = registerTxId ? { hash: registerTxId as Hex } : null
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

  const handleRetry = () => {
    actor.send({ type: 'RETRY' })
  }

  const handleReset = () => {
    actor.send({ type: 'CANCEL' })
    dispatch({ type: 'RESET', initialName })
  }

  const displayDomainName = domainName || ''

  return (
    <div className="mx-6 flex flex-col items-start gap-4 md:flex-row">
      <div className="absolute flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={handleBack}
          className="h-auto p-2 text-lapis-surface uppercase"
        >
          <ArrowLeftIcon className="h-6 w-6 font-bold" /> Back
        </Button>
      </div>

      {step === RegistrationStep.PRICING && displayDomainName && (
        <div className="w-full py-6 md:py-6">
          <Pricing
            domainName={displayDomainName}
            duration={ui.duration}
            isConnected={isConnected}
            isLoading={isCommitPending || isApprovePending || isRegisterPending}
            onSetDuration={handleSetDuration}
            onSelectPayment={handleSelectPayment}
            onSelectCrypto={handleSelectCrypto}
            onConfirmPayment={(tokenPrice, selectedToken, options) =>
              handleStartRegistration(
                {
                  name: ui.name,
                  duration: ui.duration,
                  selectedToken: selectedToken as Address,
                  tokenPrice,
                },
                {
                  rhinestoneAccount,
                  accountAddress,
                  rhinestoneConfig,
                  publicClient,
                },
                actor,
                { fast: options?.fast ?? false },
              )
            }
          />
        </div>
      )}

      {step === RegistrationStep.COMMITTING && (
        <PaymentInProgress
          domainName={displayDomainName}
          selectedCrypto=""
          onPaymentSuccess={() => {}} // No-op - handled by state machine
          registerWaitSeconds={registerWaitSeconds}
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
        <RegistrationSuccess domainName={displayDomainName} />
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
