import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Autorenewal } from '../components/Autorenewal'
import { CommitmentError } from '../components/CommitmentError'
import { Pricing } from '../components/Pricing'
import { RegistrationInProgress } from '../components/RegistrationInProgress'
import { RegistrationSuccess } from '../components/RegistrationSuccess'
import { WaitingForCommitTime } from '../components/WaitingForCommitTime'
import {
  RegistrationStep,
  useEnsRegistration,
} from '../hooks/useEnsRegistration'

interface RegistrationProps {
  initialName?: string
}

export function Registration({ initialName }: RegistrationProps) {
  const navigate = useNavigate()

  // Use the XState registration hook
  const {
    step,
    domainName,
    duration,
    pricing,
    currencyType,
    remainingTime,
    commitTxHash,
    registerTxHash,
    isCommitPending,
    isRegisterPending,
    isRegisterConfirming,
    isConnected,
    setDuration,
    setCurrency,
    selectPayment,
    selectCrypto,
    confirmPayment,
    retryCommit,
    skipNotifications,
    setupAutorenewal,
    completeFlow,
    reset,
  } = useEnsRegistration(initialName)
  // UI state for backward compatibility with existing components
  const [localCurrencyType, setLocalCurrencyType] = useState<'ETH' | 'USD'>(
    'ETH',
  )

  // Navigation prevention logic
  useEffect(() => {
    // Define critical steps where navigation should be prevented
    const criticalSteps = [
      RegistrationStep.MAKE_COMMITMENT,
      RegistrationStep.WAITING_FOR_COMMIT_TIME,
      RegistrationStep.REGISTER,
    ]

    const isInCriticalStep = criticalSteps.includes(step)

    // Prevent browser back button during critical steps
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isInCriticalStep) {
        const message =
          '⚠️ Registration in progress! Leaving this page will cancel your registration. Are you sure you want to leave?'
        event.preventDefault()
        event.returnValue = message
        return message
      }
    }

    // Prevent browser back button
    const handlePopState = (event: PopStateEvent) => {
      if (isInCriticalStep) {
        event.preventDefault()
        // Push the current state back to prevent navigation
        window.history.pushState(null, '', window.location.href)

        // Show confirmation dialog
        const confirmed = window.confirm(
          '⚠️ Registration in progress! Leaving this page will cancel your registration. Are you sure you want to leave?',
        )

        if (confirmed) {
          reset()
          navigate({ to: '/' })
        }
      }
    }

    // Prevent keyboard shortcuts (Ctrl+W, Alt+F4, etc.)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isInCriticalStep) {
        // Prevent Ctrl+W (close tab)
        if (event.ctrlKey && event.key === 'w') {
          event.preventDefault()
          return false
        }
        // Prevent Ctrl+Shift+W (close window)
        if (event.ctrlKey && event.shiftKey && event.key === 'W') {
          event.preventDefault()
          return false
        }
        // Prevent Alt+F4 (close window)
        if (event.altKey && event.key === 'F4') {
          event.preventDefault()
          return false
        }
      }
    }

    // Add event listeners
    if (isInCriticalStep) {
      window.addEventListener('beforeunload', handleBeforeUnload)
      window.addEventListener('popstate', handlePopState)
      document.addEventListener('keydown', handleKeyDown)

      // Push current state to prevent back button
      window.history.pushState(null, '', window.location.href)

      // Update page title to indicate registration in progress
      const originalTitle = document.title
      document.title = `🔄 Registration in Progress - ${originalTitle}`
    }

    // Cleanup event listeners
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handlePopState)
      document.removeEventListener('keydown', handleKeyDown)

      // Restore original page title
      if (isInCriticalStep) {
        document.title = document.title.replace(
          '🔄 Registration in Progress - ',
          '',
        )
      }
    }
  }, [step, reset, navigate])

  // Event handlers
  const handlePaymentSelect = (method: 'crypto' | 'credit-card') => {
    selectPayment(method)
    console.log('💳 Payment method selected:', method)
  }

  const handleCryptoSelect = (cryptoId: string) => {
    selectCrypto(cryptoId)
    console.log('🪙 Crypto selected:', cryptoId)
  }

  const handleBack = () => {
    // Check if we're in a critical step
    const criticalSteps = [
      RegistrationStep.MAKE_COMMITMENT,
      RegistrationStep.WAITING_FOR_COMMIT_TIME,
      RegistrationStep.REGISTER,
    ]

    if (criticalSteps.includes(step)) {
      const confirmed = window.confirm(
        '⚠️ Registration in progress! Leaving this page will cancel your registration. Are you sure you want to leave?',
      )

      if (!confirmed) {
        return
      }
    }

    // Reset the registration state when going back
    reset()
    navigate({ to: '/' })
  }

  // Create estimation for pricing component
  const estimation = useMemo(() => {
    if (!domainName) return undefined

    const basePrice = BigInt(pricing?.base || '25000000000000000')
    const totalPrice = BigInt(pricing?.totalPrice || '25000000000000000')
    const yearMultiplier = BigInt(Math.max(1, Math.floor(duration)))

    return {
      estimatedGasFee: 2000000000000000n,
      estimatedGasLoading: false,
      yearlyFee: basePrice,
      totalDurationBasedFee: totalPrice * yearMultiplier,
      hasPremium: false,
      premiumFee: 0n,
      gasPrice: 20000000000n,
      seconds: duration * 31536000,
    }
  }, [domainName, duration, pricing])

  const handleSetCurrency = (currency: 'ETH' | 'USD') => {
    setLocalCurrencyType(currency)
    setCurrency(currency)
  }

  const handleSelectPayment = (method: 'crypto' | 'credit-card') => {
    handlePaymentSelect(method)
  }

  const handleSelectCrypto = (cryptoId: string) => {
    handleCryptoSelect(cryptoId)
  }

  const handleRegistrationSuccess = () => {}

  const handleSetupAutorenewal = () => {
    setupAutorenewal()
  }

  // Display domain name
  const displayDomainName = domainName || ''

  // Check if we're in a critical step
  const criticalSteps = [
    RegistrationStep.MAKE_COMMITMENT,
    RegistrationStep.WAITING_FOR_COMMIT_TIME,
    RegistrationStep.REGISTER,
  ]
  const isInCriticalStep = criticalSteps.includes(step)

  return (
    <div className="mx-auto max-w-md">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={handleBack}
          className="h-auto p-2"
          disabled={isInCriticalStep}
        >
          ← Back
          {isInCriticalStep && (
            <span className="ml-2 text-xs text-orange-600">
              (Registration in progress)
            </span>
          )}
        </Button>

        {/* Debug info for development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="text-gray-500 text-xs">XState: {step}</div>
        )}
      </div>

      {/* Navigation warning for critical steps */}
      {isInCriticalStep && (
        <div className="mb-4 rounded-md bg-orange-50 p-3 text-sm text-orange-800">
          <div className="flex items-center">
            <span className="mr-2">⚠️</span>
            <span>
              <strong>Registration in progress!</strong> Please don't close this
              page or navigate away until the registration is complete.
            </span>
          </div>

          {/* Step-specific progress messages */}
          {step === RegistrationStep.MAKE_COMMITMENT && (
            <div className="mt-2 text-xs text-orange-700">
              🔒 Committing your domain registration...
            </div>
          )}

          {step === RegistrationStep.WAITING_FOR_COMMIT_TIME && (
            <div className="mt-2 text-xs text-orange-700">
              ⏰ Waiting for commitment to mature ({remainingTime}s
              remaining)...
            </div>
          )}

          {step === RegistrationStep.REGISTER && (
            <div className="mt-2 text-xs text-orange-700">
              📝 Registering your domain on the blockchain...
            </div>
          )}
        </div>
      )}

      {step === RegistrationStep.PRICING && displayDomainName && (
        <div className="mx-auto max-w-md px-4 py-6">
          <Pricing
            domainName={displayDomainName}
            duration={duration}
            currencyType={currencyType || localCurrencyType}
            estimation={estimation}
            isConnected={isConnected}
            isLoading={isCommitPending}
            onSetDuration={setDuration}
            onSetCurrency={handleSetCurrency}
            onSelectPayment={handleSelectPayment}
            onSelectCrypto={handleSelectCrypto}
            onConfirmPayment={confirmPayment}
          />
        </div>
      )}

      {step === RegistrationStep.WAITING_FOR_COMMIT_TIME && (
        <WaitingForCommitTime
          domainName={displayDomainName}
          remainingTime={remainingTime}
          commitTxHash={commitTxHash}
          onSkip={
            process.env.NODE_ENV === 'development'
              ? skipNotifications
              : undefined
          }
        />
      )}

      {step === RegistrationStep.COMMITMENT_ERROR && (
        <CommitmentError domainName={displayDomainName} onRetry={retryCommit} />
      )}

      {step === RegistrationStep.REGISTER && (
        <RegistrationInProgress
          domainName={displayDomainName}
          registerTxHash={registerTxHash}
          isRegisterConfirming={isRegisterConfirming}
          onRegistrationSuccess={handleRegistrationSuccess}
        />
      )}

      {step === RegistrationStep.REGISTER_SUCCESS && (
        <RegistrationSuccess
          domainName={displayDomainName}
          onSetupAutorenewal={handleSetupAutorenewal}
        />
      )}

      {step === RegistrationStep.AUTORENEWAL && (
        <Autorenewal
          domainName={displayDomainName}
          duration={duration}
          onReset={reset}
          onCompleteFlow={completeFlow}
        />
      )}

      {/* Debug panel in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mx-auto mt-4 max-w-md p-4">
          <details className="text-xs">
            <summary className="cursor-pointer font-medium text-gray-600">
              XState Debug Info
            </summary>
            <div className="mt-2 space-y-1 rounded bg-gray-100 p-2 font-mono text-gray-800">
              <div>
                <strong>Step:</strong> {step}
              </div>
              <div>
                <strong>Domain:</strong> {domainName}
              </div>
              <div>
                <strong>Duration:</strong> {duration}y
              </div>
              <div>
                <strong>Connected:</strong> {isConnected ? '✅' : '❌'}
              </div>
              <div>
                <strong>Commit Pending:</strong> {isCommitPending ? '⏳' : '✅'}
              </div>
              <div>
                <strong>Register Pending:</strong>{' '}
                {isRegisterPending ? '⏳' : '✅'}
              </div>
              {remainingTime > 0 && (
                <div>
                  <strong>Timer:</strong> {remainingTime}s
                </div>
              )}
              {commitTxHash && (
                <div>
                  <strong>Commit TX:</strong> {commitTxHash.slice(0, 10)}...
                </div>
              )}
              {registerTxHash && (
                <div>
                  <strong>Register TX:</strong> {registerTxHash.slice(0, 10)}...
                </div>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
