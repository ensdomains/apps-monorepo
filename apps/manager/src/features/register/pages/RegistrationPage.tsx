import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { ApprovalInProgress } from '../components/ApprovalInProgress'
import { Autorenewal } from '../components/Autorenewal'
import { PaymentInProgress } from '../components/PaymentInProgress'
import { Pricing } from '../components/Pricing'
import { RegistrationInProgress } from '../components/RegistrationInProgress'
import { RegistrationSuccess } from '../components/RegistrationSuccess'
import { RegistrationStep, useRegistration } from '../hooks/useRegistration'

interface RegistrationProps {
  initialName?: string
  initialDuration?: number
}

export function Registration({
  initialName,
  initialDuration,
}: RegistrationProps) {
  const navigate = useNavigate()
  const {
    step,
    name: domainName,
    duration,
    selectedToken,
    commitTxHash,
    registerTxHash,
    isConnected,
    isCommitting: isCommitPending,
    isApproving: isApprovePending,
    isRegistering: isRegisterPending,
    error,
    setDuration,
    startCommitment,
    retry,
    reset,
    handleSetupAutorenewal,
    handleRegisterAnotherName,
  } = useRegistration(initialName, initialDuration)

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
      reset()
    }
  }

  const handleSetDuration = (newDuration: number) => {
    setDuration(newDuration)
  }

  const handleSelectPayment = (_method: 'crypto' | 'credit-card') => {
    // No-op for now - handled by payment drawer
  }

  const handleSelectCrypto = (_cryptoId: string) => {
    // No-op for now - handled by payment drawer
  }

  const handleConfirmPayment = (tokenPrice: bigint, selectedToken: string) => {
    // Use the centralized token configuration
    // selectedToken is already the correct address from PaymentDrawer
    startCommitment({
      tokenPrice,
      selectedToken: selectedToken as `0x${string}`,
    })
  }

  const handlePaymentSuccess = () => {
    // Payment success is handled automatically by the state machine
  }

  // domainName already includes .eth from the state machine
  const displayDomainName = domainName || ''

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={handleBack} className="h-auto p-2">
          ← Back
        </Button>
      </div>

      {step === RegistrationStep.PRICING && displayDomainName && (
        <div className="mx-auto max-w-4xl px-4 py-6">
          <Pricing
            domainName={displayDomainName}
            duration={duration}
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
          selectedToken={selectedToken}
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
          duration={duration}
          onReset={handleRegisterAnotherName}
          onCompleteFlow={handleRegisterAnotherName}
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
            <Button onClick={retry} className="mr-2">
              Retry
            </Button>
            <Button variant="outline" onClick={reset}>
              Start Over
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
