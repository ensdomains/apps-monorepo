import { registrationMachine } from '@ens-apps/transaction-manager'
import { useNavigate } from '@tanstack/react-router'
import { useActorRef, useSelector } from '@xstate/react'
import { ArrowLeftIcon } from 'lucide-react'
import { useCallback, useEffect, useReducer, useState } from 'react'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { useAccount, useAccountEffect } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Pricing } from '@/features/register/components/Pricing'
import type { NotificationPreferences } from '@/features/register/components/RegistrationInProgress/NotificationSettings'
import { RegistrationInProgress } from '@/features/register/components/RegistrationInProgress/RegistrationInProgress'
import { VerifyWalletModal } from '@/features/register/components/VerifyWalletModal'
import { useRhinestoneAccount } from '@/lib/rhinestone/useRhinestoneAccount'
import { publicClient } from '@/lib/wagmi'
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

function mapMachineStateToStep(
  machineState: string | Record<string, any>,
): RegistrationStep {
  // Handle nested error states (error.submission, error.reverted, etc.)
  if (typeof machineState === 'object' && 'error' in machineState) {
    return RegistrationStep.ERROR
  }

  const stateString = String(machineState)

  switch (stateString) {
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
  const { address } = useAccount()

  // Local UI state
  const [ui, dispatch] = useReducer(
    registrationUIReducer,
    createInitialUIState(initialName),
  )

  // Verify wallet modal state
  const [showVerifyModal, setShowVerifyModal] = useState(false)

  // Pricing data for registration details
  const [pricingData, setPricingData] = useState<{
    finalPrice: number
    discountAmount: number
  } | null>(null)

  // Notification preferences state
  const [hasSkippedNotifications, setHasSkippedNotifications] = useState(false)
  const [hasConfirmedNotifications, setHasConfirmedNotifications] =
    useState(false)

  // Show verification modal after wallet connection
  useAccountEffect({
    onConnect({ address: connectedAddress }) {
      if (connectedAddress && typeof window !== 'undefined') {
        // Check if this address has been verified before
        const verified = localStorage.getItem(
          `wallet_verified_${connectedAddress}`,
        )
        if (verified !== 'true') {
          // Small delay to ensure UI is ready
          setTimeout(() => {
            setShowVerifyModal(true)
          }, 500)
        }
      }
    },
  })

  // Also check on mount if already connected
  useEffect(() => {
    if (isConnected && address && typeof window !== 'undefined') {
      const verified = localStorage.getItem(`wallet_verified_${address}`)
      if (verified !== 'true') {
        // Small delay to ensure UI is ready
        setTimeout(() => {
          setShowVerifyModal(true)
        }, 500)
      }
    }
  }, [isConnected, address])

  const handleVerificationComplete = () => {
    if (address && typeof window !== 'undefined') {
      localStorage.setItem(`wallet_verified_${address}`, 'true')
    }
    setShowVerifyModal(false)
  }

  // Derived state
  const isAccountReady = Boolean(
    rhinestoneAccount && accountAddress && rhinestoneConfig,
  )

  // Selectors - directly select from machine state
  const step = useSelector(actor, (state) => {
    if (!isAccountReady) return RegistrationStep.PRICING
    // Pass raw state.value to handle nested error states
    return mapMachineStateToStep(state.value)
  })

  const domainName = useSelector(
    actor,
    (state) => state.context.name || ui.name,
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

  const handleNotificationConfirm = (preferences: NotificationPreferences) => {
    // TODO: Send notification preferences to API
    console.log('Notification preferences confirmed:', preferences)
    setHasConfirmedNotifications(true)
  }

  const handleNotificationSkip = () => {
    setHasSkippedNotifications(true)
  }

  const handleGoToDashboard = () => {
    navigate({ to: '/' })
  }

  const handleCreateProfile = () => {
    // TODO: Navigate to profile creation
    console.log('Create profile clicked')
  }

  const handlePricingDataChange = useCallback(
    (finalPrice: number, discountAmount: number) => {
      setPricingData({ finalPrice, discountAmount })
    },
    [],
  )

  const _handleReset = () => {
    actor.send({ type: 'CANCEL' })
    dispatch({ type: 'RESET', initialName })
  }

  const displayDomainName = domainName || ''

  return (
    <>
      <VerifyWalletModal
        open={showVerifyModal}
        onOpenChange={setShowVerifyModal}
        onVerified={handleVerificationComplete}
      />
      <div className="mx-6 flex flex-col items-start gap-4 md:flex-row">
        <div className="absolute flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleBack}
            className="h-auto p-2 text-ens-lapis-surface uppercase"
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
              isLoading={
                isCommitPending || isApprovePending || isRegisterPending
              }
              onSetDuration={handleSetDuration}
              onSelectPayment={handleSelectPayment}
              onSelectCrypto={handleSelectCrypto}
              onConfirmPayment={(tokenPrice, selectedToken, options) => {
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
              }}
              onPricingDataChange={handlePricingDataChange}
            />
          </div>
        )}

        {(step === RegistrationStep.COMMITTING ||
          step === RegistrationStep.APPROVING ||
          step === RegistrationStep.REGISTERING ||
          step === RegistrationStep.SUCCESS ||
          step === RegistrationStep.ERROR) && (
          <RegistrationInProgress
            domainName={displayDomainName}
            actor={actor}
            duration={ui.duration}
            totalPrice={pricingData?.finalPrice ?? 0}
            discountAmount={pricingData?.discountAmount ?? 0}
            registerWaitSeconds={registerWaitSeconds}
            onNotificationConfirm={handleNotificationConfirm}
            onNotificationSkip={handleNotificationSkip}
            onGoToDashboard={handleGoToDashboard}
            onCreateProfile={handleCreateProfile}
            showRegistrationDetails={
              hasSkippedNotifications || hasConfirmedNotifications
            }
          />
        )}
      </div>
    </>
  )
}
