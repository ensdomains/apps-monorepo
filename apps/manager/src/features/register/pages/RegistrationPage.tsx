import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { useAccountAbstraction } from '@/lib/web3Auth/useAccountAbstraction'
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
    isRegisterConfirming,

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

  const { smartAccountInfo, isLoading: isLoadingAccount } =
    useAccountAbstraction()

  const isConnected = smartAccountInfo?.isConnected || false

  console.log('smartAccountInfo', smartAccountInfo)

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
        <div className="mx-auto max-w-md space-y-6 px-4 py-6">
          {isLoadingAccount ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="mb-2 text-gray-500 text-sm">
                  Loading account information...
                </div>
                <div className="text-gray-400 text-xs">
                  Please wait while we connect to your wallet
                </div>
              </div>
            </div>
          ) : (
            <Pricing
              domainName={displayDomainName}
              duration={duration}
              isConnected={isConnected}
              isLoading={isCommitPending}
              onSetDuration={setDuration}
              onSelectPayment={handleSelectPayment}
              onSelectCrypto={handleSelectCrypto}
              onConfirmPayment={(tokenPrice, selectedToken) =>
                confirmPayment(Number(tokenPrice), selectedToken)
              }
            />
          )}
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
        <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="mb-2 font-semibold text-gray-900">Debug Info</h3>
          <div className="space-y-1 text-gray-600 text-sm">
            <div>Step: {step}</div>
            <div>Domain: {domainName || 'None'}</div>
            <div>Duration: {duration} years</div>
            <div>Connected: {isConnected ? 'Yes' : 'No'}</div>
            <div>Commit Hash: {commitTxHash || 'None'}</div>
            <div>Register Hash: {registerTxHash || 'None'}</div>
          </div>
        </div>
      )}
    </div>
  )
}
