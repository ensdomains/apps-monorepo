import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { useAccountAbstraction } from '@/lib/web3Auth/useAccountAbstraction'
import { Autorenewal } from '../components/Autorenewal'
import { CommitmentError } from '../components/CommitmentError'
import { Pricing } from '../components/Pricing'
import { RegistrationInProgress } from '../components/RegistrationInProgress'
import { RegistrationSuccess } from '../components/RegistrationSuccess'
import { WaitingForCommitTime } from '../components/WaitingForCommitTime'
import { useEnsRegistration } from '../hooks/useEnsRegistration'

interface RegistrationProps {
  initialName?: string
}

export function Registration({ initialName }: RegistrationProps) {
  const navigate = useNavigate()

  const {
    domainName,
    duration,
    remainingTime,
    commitTxHash,
    registerTxHash,
    isCommitPending,
    isRegisterPending,
    isRegisterConfirming,
    isConnected,
    // State matching helpers
    isCommitmentError,
    isRegistrationError,
    isWaitingForCommitTime,
    isRegisterSuccess,
    isAutorenewal,
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

  console.log('smartAccountInfo', smartAccountInfo)

  const handlePaymentSelect = (method: 'crypto' | 'credit-card') => {
    selectPayment(method)
  }



  const handleBack = () => {
    if (isCommitPending || isRegisterPending) {
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



  const handleRegistrationSuccess = () => {}

  const handleSetupAutorenewal = () => {
    setupAutorenewal()
  }

  const displayDomainName = domainName || ''

  const isInCriticalStep = isCommitPending || isRegisterPending

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
          <div className="text-gray-500 text-xs">XState: {isCommitPending ? 'makeCommitment' : isWaitingForCommitTime ? 'waitingForCommitTime' : isRegisterPending ? 'registerInProgress' : 'pricing'}</div>
        )}
      </div>

      {!isCommitPending && !isWaitingForCommitTime && !isRegisterPending && !isCommitmentError && !isRegistrationError && !isRegisterSuccess && !isAutorenewal && displayDomainName && (
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
              onSelectCrypto={selectCrypto}
              onConfirmPayment={(tokenPrice, selectedToken) =>
                confirmPayment(Number(tokenPrice), selectedToken)
              }
            />
          )}
        </div>
      )}

      {isWaitingForCommitTime && (
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

      {isRegisterPending && (
        <RegistrationInProgress
          domainName={displayDomainName}
          registerTxHash={registerTxHash}
          isRegisterConfirming={isRegisterConfirming}
          onRegistrationSuccess={handleRegistrationSuccess}
        />
      )}

      {isCommitmentError && (
        <CommitmentError domainName={displayDomainName} onRetry={retryCommit} />
      )}

      {isRegistrationError && (
        <CommitmentError domainName={displayDomainName} onRetry={retryCommit} />
      )}

      {isRegisterSuccess && (
        <RegistrationSuccess
          domainName={displayDomainName}
          onSetupAutorenewal={handleSetupAutorenewal}
        />
      )}

      {isAutorenewal && (
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
            <div>State: {isCommitPending ? 'makeCommitment' : isWaitingForCommitTime ? 'waitingForCommitTime' : isRegisterPending ? 'registerInProgress' : 'pricing'}</div>
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
