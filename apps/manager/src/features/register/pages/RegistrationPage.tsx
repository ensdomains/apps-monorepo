import { registrationMachine } from '@ens-apps/transaction-manager'
import { useNavigate } from '@tanstack/react-router'
import { useActorRef, useSelector } from '@xstate/react'
import { AlertCircle, ArrowLeftIcon } from 'lucide-react'
import { useCallback, useReducer, useState } from 'react'
import type { Address, PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import { Button } from '@/components/ui/button'
import { useCheckAvailability } from '@/features/register/components/CheckAvailability/useCheckAvailability'
import { Pricing } from '@/features/register/components/Pricing'
import { PricingDomainHeader } from '@/features/register/components/Pricing/PricingDomainHeader'
import type { NotificationPreferences } from '@/features/register/components/RegistrationInProgress/NotificationSettings'
import { RegistrationInProgress } from '@/features/register/components/RegistrationInProgress/RegistrationInProgress'
import { VerifyWalletModal } from '@/features/register/components/VerifyWalletModal'
import { useCountdown } from '@/hooks/useCountdown'
import { useWalletVerification } from '@/hooks/useWalletVerification'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
import { inspect } from '@/utils/xstate'
import { handleStartRegistration } from './RegistrationPage.handlers'
import {
  createInitialUIState,
  registrationUIReducer,
} from './RegistrationPage.reducer'

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

function mapMachineStateToStep(
  machineState: string | Record<string, unknown>,
): RegistrationStep {
  if (typeof machineState === 'object' && 'error' in machineState) {
    return RegistrationStep.ERROR
  }

  const stateString = String(machineState)

  switch (stateString) {
    case 'idle':
      return RegistrationStep.PRICING
    case 'settingUpRegistration':
    case 'deployingResolver':
    case 'waitingForResolverDeployment':
    case 'preparingCommitment':
    case 'committingTransaction':
    case 'waitingForCommitment':
    case 'commitmentCooldown':
    case 'validatingCommitment':
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

export function Registration({ initialName }: RegistrationProps) {
  const navigate = useNavigate()

  const actor = useActorRef(registrationMachine, {
    input: {
      chainId: sepolia.id,
    },
    inspect,
  })

  // Use shared smart account context (smart sessions - sign once)
  const account = useSmartAccountContext()

  // Extract account info
  const accountAddress = account.accountAddress
  const isConnected = account.isConnected

  const [ui, dispatch] = useReducer(
    registrationUIReducer,
    createInitialUIState(initialName),
  )

  const { showVerifyModal, setShowVerifyModal, handleVerificationComplete } =
    useWalletVerification()

  const [pricingData, setPricingData] = useState<{
    finalPrice: number
    discountAmount: number
  } | null>(null)

  const [hasSkippedNotifications, setHasSkippedNotifications] = useState(false)
  const [hasConfirmedNotifications, setHasConfirmedNotifications] =
    useState(false)

  const {
    selectedName,
    isAvailable,
    errorMessage: availabilityError,
    isSearching: isCheckingAvailability,
  } = useCheckAvailability({ initialName, autoSearch: true })

  const isAccountReady = Boolean(
    accountAddress && account.client && account.config,
  )

  const step = useSelector(actor, (state) => {
    if (!isAccountReady) return RegistrationStep.PRICING
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

  const { remainingSeconds: registerWaitSeconds } = useCountdown(
    registerReadyTimestamp,
  )

  const isCommitPending = step === RegistrationStep.COMMITTING
  const isApprovePending = step === RegistrationStep.APPROVING
  const isRegisterPending = step === RegistrationStep.REGISTERING

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
    console.log('Notification preferences confirmed:', preferences)
    setHasConfirmedNotifications(true)
  }

  const handleNotificationSkip = () => {
    setHasSkippedNotifications(true)
  }

  const handleGoToDashboard = () => {
    navigate({ to: '/dashboard' })
  }

  const handleCreateProfile = () => {
    console.log('Create profile clicked')
  }

  const handlePricingDataChange = useCallback(
    (finalPrice: number, discountAmount: number) => {
      setPricingData({ finalPrice, discountAmount })
    },
    [],
  )

  const displayDomainName = domainName || ''

  return (
    <>
      <VerifyWalletModal
        open={showVerifyModal}
        onOpenChange={setShowVerifyModal}
        onVerified={handleVerificationComplete}
      />
      <div className="mx-6 flex flex-col items-start gap-4 md:flex-row">
        {!(hasSkippedNotifications || hasConfirmedNotifications) && (
          <div className="absolute flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={handleBack}
              className="h-auto p-2 text-ens-lapis-surface uppercase"
            >
              <ArrowLeftIcon className="h-6 w-6 font-bold" /> Back
            </Button>
          </div>
        )}

        {step === RegistrationStep.PRICING && displayDomainName && (
          <div className="w-full py-6 md:py-6">
            {isCheckingAvailability && initialName && (
              <div className="flex min-h-[400px] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-ens-lapis-surface border-t-transparent" />
                  <p className="text-ens-gray">
                    Checking availability for {displayDomainName}...
                  </p>
                </div>
              </div>
            )}

            {!isCheckingAvailability &&
              initialName &&
              selectedName &&
              isAvailable === false && (
                <div className="flex min-h-[400px] items-center justify-center px-4">
                  <div className="flex w-full max-w-2xl flex-col items-center gap-8 rounded-lg border border-ens-gray-two bg-white p-8 text-center">
                    <AlertCircle className="h-16 w-16 text-ens-gray" />

                    <div className="flex w-full flex-col items-center gap-4">
                      <div className="w-full opacity-40">
                        <PricingDomainHeader
                          domainName={displayDomainName}
                          premiumLabel={undefined}
                        />
                      </div>

                      <p className="text-ens-gray text-sm">
                        {availabilityError || 'This name is not available'}
                      </p>
                    </div>

                    <Button
                      onClick={() => navigate({ to: '/' })}
                      className="h-14 w-full rounded bg-ens-blue font-mono text-sm text-white uppercase tracking-wider hover:bg-ens-blue-hover"
                    >
                      Back to Search
                    </Button>
                  </div>
                </div>
              )}

            {(!initialName ||
              (!isCheckingAvailability && isAvailable !== false)) && (
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
                    account,
                    actor,
                    {
                      publicClient: publicClient as PublicClient,
                      fast: options?.fast ?? true,
                    },
                  )
                }}
                onPricingDataChange={handlePricingDataChange}
              />
            )}
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
