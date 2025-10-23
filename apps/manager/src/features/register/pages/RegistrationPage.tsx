import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { ApprovalInProgress } from '../components/ApprovalInProgress'
import { PaymentInProgress } from '../components/PaymentInProgress'
import { Pricing } from '../components/Pricing'
import { RegistrationInProgress } from '../components/RegistrationInProgress'
import { RegistrationSuccess } from '../components/RegistrationSuccess'
import { useRegistration, RegistrationStep } from '../hooks/useRegistration'

interface RegistrationProps {
  initialName?: string
}

export function Registration({ initialName }: RegistrationProps) {
  const navigate = useNavigate()
  const {
    step,
    name: domainName,
    duration,
    selectedToken,
    isConnected,
    isCommitting: isCommitPending,
    isApproving: isApprovePending,
    isRegistering: isRegisterPending,
    error,
    setDuration,
    startCommitment,
    retry,
    reset,
  } = useRegistration(initialName)

  const handleBack = () => {
    if (step === RegistrationStep.PRICING) {
      navigate({ to: '/' })
    } else if (step === RegistrationStep.APPROVING || step === RegistrationStep.REGISTERING) {
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
    // Map selectedToken string to 'USDC' | 'DAI'
    const token = selectedToken.toUpperCase() as 'USDC' | 'DAI'
    startCommitment({
      tokenPrice,
      selectedToken: token
    })
  }

  const handlePaymentSuccess = () => {
    // Payment success is handled automatically by the state machine
  }

  const handleRegistrationSuccess = () => {
    // Registration success is handled automatically by the state machine
  }

  const handleSetupAutorenewal = () => {
    // TODO: Implement auto-renewal
    reset()
  }

  // domainName already includes .eth from the state machine
  const displayDomainName = domainName || ''

  return (
    <div className="mx-auto max-w-md">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={handleBack} className="h-auto p-2">
          ← Back
        </Button>
      </div>

      {step === RegistrationStep.PRICING && displayDomainName && (
        <div className="mx-auto max-w-md px-4 py-6">
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
        />
      )}

      {step === RegistrationStep.REGISTERING && (
        <RegistrationInProgress
          domainName={displayDomainName}
          onRegistrationSuccess={handleRegistrationSuccess}
        />
      )}

      {step === RegistrationStep.SUCCESS && (
        <RegistrationSuccess
          domainName={displayDomainName}
          onSetupAutorenewal={handleSetupAutorenewal}
        />
      )}

      {step === RegistrationStep.ERROR && (
        <div className="mx-auto max-w-md px-4 py-6">
          <div className="text-center">
            <h2 className="text-red-600 text-xl font-semibold mb-4">
              Registration Error
            </h2>
            <p className="text-gray-600 mb-4 whitespace-pre-line">
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
