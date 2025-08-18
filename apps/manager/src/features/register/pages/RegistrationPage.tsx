import { useNavigate } from '@tanstack/react-router'

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

  const {
    step,
    domainName,
    duration,
    remainingTime,
    commitTxHash,
    registerTxHash,
    isCommitPending,
    isRegisterPending,
    isRegisterConfirming,
    isConnected,
    setDuration,
    selectPayment,
    selectCrypto,
    confirmPayment,
    retryCommit,
    skipNotifications,
    setupAutorenewal,
    completeFlow,
    reset,
  } = useEnsRegistration(initialName)

  const handlePaymentSelect = (method: 'crypto' | 'credit-card') => {
    selectPayment(method)
  }

  const handleCryptoSelect = (cryptoId: string) => {
    selectCrypto(cryptoId)
  }

  const handleBack = () => {
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

    reset()
    navigate({ to: '/' })
  }

  // Note: Pricing is now handled directly in the Pricing component using getTokenPrices

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

  const displayDomainName = domainName || ''

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
        </Button>

        {process.env.NODE_ENV === 'development' && (
          <div className="text-gray-500 text-xs">XState: {step}</div>
        )}
      </div>

      {step === RegistrationStep.PRICING && displayDomainName && (
        <div className="mx-auto max-w-md px-4 py-6">
          <Pricing
            domainName={displayDomainName}
            duration={duration}
            isConnected={isConnected}
            isLoading={isCommitPending}
            onSetDuration={setDuration}
            onSelectPayment={handleSelectPayment}
            onSelectCrypto={handleSelectCrypto}
            onConfirmPayment={(tokenPrice, selectedToken) =>
              confirmPayment(tokenPrice, selectedToken)
            }
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

      {step === RegistrationStep.REGISTRATION_ERROR && (
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
