import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
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

  return (
    <div className="mx-auto max-w-md">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={handleBack} className="h-auto p-2">
          ← Back
        </Button>

        {/* Debug info for development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="text-gray-500 text-xs">XState: {step}</div>
        )}
      </div>

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

      {/* XState enhanced waiting period with countdown */}
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
              <Button
                onClick={reset}
                size="sm"
                variant="outline"
                className="mt-2"
              >
                Reset State
              </Button>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
