import { registrationMachine } from '@ens-apps/transaction-manager'
import { useNavigate } from '@tanstack/react-router'
import { useActorRef, useSelector } from '@xstate/react'
import { useAtom } from '@xstate/store-react'
import { AlertCircle, ArrowLeftIcon } from 'lucide-react'
import { useCallback, useReducer, useState } from 'react'
import type { Address, PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import { Button } from '@/components/ui/button'
import { useCheckAvailability } from '@/features/register/components/CheckAvailability/useCheckAvailability'
import { Pricing } from '@/features/register/components/Pricing'
import { PricingDomainHeader } from '@/features/register/components/Pricing/PricingDomainHeader'
import { RegistrationInProgress } from '@/features/register/components/RegistrationInProgress/RegistrationInProgress'
import { useCountdown } from '@/hooks/useCountdown'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
import { isBackendAuthed } from '@/utils/backend-client'
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
    // Rhinestone: single batched intent (approve + register) after commitment cooldown
    case 'submittingRhinestoneBundle':
    case 'waitingForRhinestoneBundle':
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

export const Registration = ({
  initialName,
  initialDuration,
}: RegistrationProps) => {
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
    createInitialUIState(initialName, initialDuration),
  )

  const [pricingData, setPricingData] = useState<{
    finalPrice: number
    discountAmount: number
  } | null>(null)

  const skipNotificationSettings = useAtom(
    isBackendAuthed,
    (isAuthed) => !isAuthed,
  )

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
    const mapped = mapMachineStateToStep(state.value)
    if (isAccountReady) {
      return mapped
    }
    // During long Rhinestone intents, smart-account context can briefly report
    // not ready; don't snap back to Pricing once registration has started or finished.
    if (
      mapped === RegistrationStep.COMMITTING ||
      mapped === RegistrationStep.APPROVING ||
      mapped === RegistrationStep.REGISTERING ||
      mapped === RegistrationStep.SUCCESS ||
      mapped === RegistrationStep.ERROR
    ) {
      return mapped
    }
    return RegistrationStep.PRICING
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
    const urlDuration = Math.round(newDuration * 100) / 100
    navigate({
      to: '/register',
      search: (prev) => ({ ...prev, duration: urlDuration }),
      replace: true,
    })
  }

  const handleSelectPayment = (_method: 'crypto' | 'credit-card') => {
    // No-op for now - handled by payment drawer
  }

  const handleSelectCrypto = (_cryptoId: string) => {
    // No-op for now - handled by payment drawer
  }

  const handleNotificationConfirm = () => {
    setHasConfirmedNotifications(true)
  }

  const handleNotificationSkip = () => {
    setHasSkippedNotifications(true)
  }

  const handleGoToDashboard = () => {
    navigate({ to: '/dashboard' })
  }

  const handleProfileNavigate = () => {
    if (!displayDomainName) return
    navigate({ to: '/p/$name', params: { name: displayDomainName } })
  }

  const handlePricingDataChange = useCallback(
    (finalPrice: number, discountAmount: number) => {
      setPricingData({ finalPrice, discountAmount })
    },
    [],
  )

  const displayDomainName = domainName || ''

  return (
    <div className="mx-6 flex flex-col items-start gap-4 md:flex-row">
      {!(
        skipNotificationSettings ||
        hasSkippedNotifications ||
        hasConfirmedNotifications
      ) && (
        <div className="absolute flex items-center justify-between">
          <Button
            className="h-auto p-2 text-ens-lapis-surface uppercase"
            onClick={handleBack}
            variant="ghost"
          >
            <ArrowLeftIcon className="h-6 w-6 font-bold" /> Back
          </Button>
        </div>
      )}

      {step === RegistrationStep.PRICING && displayDomainName && (
        <div className="w-full py-6 md:py-6">
          {isCheckingAvailability && initialName && (
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pt-4 pb-12 md:px-10">
              <PricingDomainHeader
                domainName={displayDomainName}
                premiumLabel={undefined}
              />
              <div className="flex flex-col items-center gap-4">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-ens-lapis-surface border-t-transparent" />
                <p className="text-center text-ens-gray">
                  Checking availability...
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
                    className="h-14 w-full rounded bg-ens-blue font-mono text-sm text-white uppercase tracking-wider hover:bg-ens-blue-hover"
                    onClick={() => navigate({ to: '/' })}
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
              onSelectCrypto={handleSelectCrypto}
              onSelectPayment={handleSelectPayment}
              onSetDuration={handleSetDuration}
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
          actor={actor}
          discountAmount={pricingData?.discountAmount ?? 0}
          domainName={displayDomainName}
          duration={ui.duration}
          onGoToDashboard={handleGoToDashboard}
          onNotificationConfirm={handleNotificationConfirm}
          onNotificationSkip={handleNotificationSkip}
          onProfileNavigate={handleProfileNavigate}
          registerWaitSeconds={registerWaitSeconds}
          showRegistrationDetails={
            skipNotificationSettings ||
            hasSkippedNotifications ||
            hasConfirmedNotifications
          }
          totalPrice={pricingData?.finalPrice ?? 0}
        />
      )}
    </div>
  )
}
