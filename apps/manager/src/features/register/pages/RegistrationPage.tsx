import { useNavigate } from '@tanstack/react-router'
import { useMachine } from '@xstate/react'
import { useEffect, useMemo } from 'react'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Autorenewal } from '../components/Autorenewal'
import { PaymentInProgress } from '../components/PaymentInProgress'
import { PaymentSuccess } from '../components/PaymentSuccess'
import { Pricing } from '../components/Pricing'
import { RegistrationInProgress } from '../components/RegistrationInProgress'
import { RegistrationSuccess } from '../components/RegistrationSuccess'
import {
  RegistrationStep,
  searchMachine,
} from '../machines/registrationMachineMock'

interface RegistrationProps {
  initialName?: string
}

export function Registration({ initialName }: RegistrationProps) {
  const navigate = useNavigate()
  const { isConnected } = useAccount()
  const [state, send] = useMachine(searchMachine)

  useEffect(() => {
    if (initialName) {
      // Set domain name in context and prepare for pricing
      send({ type: 'search', name: initialName })
    }
  }, [initialName, send])

  const { step, name, domainName, duration, currencyType, selectedCrypto } =
    state.context

  // TODO: remove this once we have a real duration
  const pricingDuration = Math.ceil(duration)

  // TODO: remove this once we have a real estimation
  const estimation = useMemo(() => {
    if (!domainName && !name) return undefined

    const baseYearlyFee = 5000000000000000n
    const yearMultiplier = BigInt(Math.max(1, Math.floor(pricingDuration)))

    return {
      estimatedGasFee: 2000000000000000n,
      estimatedGasLoading: false,
      yearlyFee: baseYearlyFee,
      totalDurationBasedFee: baseYearlyFee * yearMultiplier,
      hasPremium: false,
      premiumFee: 0n,
      gasPrice: 20000000000n,
      seconds: pricingDuration * 31536000,
    }
  }, [domainName, name, pricingDuration])

  const handleBack = () => {
    if (step === RegistrationStep.PRICING) {
      navigate({ to: '/' })
    } else if (step === RegistrationStep.REGISTRATION_IN_PROGRESS) {
      // This step goes to PaymentSuccess, but we want Pricing
      // So we go back twice: first to PaymentSuccess, then to Pricing
      send({ type: 'back' })
      setTimeout(() => send({ type: 'back' }), 0)
    } else {
      // All other steps go to pricing on 'back'
      send({ type: 'back' })
    }
  }

  const handleSetDuration = (newDuration: number) => {
    send({ type: 'setDuration', duration: newDuration })
  }

  const handleSetCurrency = (currency: 'ETH' | 'USD') => {
    send({ type: 'setCurrency', currencyType: currency })
  }

  const handleSelectPayment = (method: 'crypto' | 'credit-card') => {
    send({ type: 'selectPayment', method })
  }

  const handleSelectCrypto = (cryptoId: string) => {
    send({ type: 'selectCrypto', cryptoId })
  }

  const handleConfirmPayment = () => {
    send({ type: 'confirmPayment' })
  }

  const handlePaymentSuccess = () => {
    send({ type: 'paymentSuccess' })
  }

  const handleSkipNotifications = () => {
    send({ type: 'skipNotifications' })
  }

  const handleRegistrationSuccess = () => {
    send({ type: 'registrationSuccess' })
  }

  const handleSetupAutorenewal = () => {
    send({ type: 'setupAutorenewal' })
  }

  // domainName already includes .eth from the state machine
  const displayDomainName =
    domainName || (name ? (name.endsWith('.eth') ? name : `${name}.eth`) : '')

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
            currencyType={currencyType}
            estimation={estimation}
            isConnected={isConnected}
            onSetDuration={handleSetDuration}
            onSetCurrency={handleSetCurrency}
            onSelectPayment={handleSelectPayment}
            onSelectCrypto={handleSelectCrypto}
            onConfirmPayment={handleConfirmPayment}
          />
        </div>
      )}

      {step === RegistrationStep.PAYMENT_IN_PROGRESS && (
        <PaymentInProgress
          domainName={displayDomainName}
          selectedCrypto={selectedCrypto}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

      {step === RegistrationStep.PAYMENT_SUCCESS && (
        <PaymentSuccess
          domainName={displayDomainName}
          onComplete={handleSkipNotifications}
        />
      )}

      {step === RegistrationStep.REGISTRATION_IN_PROGRESS && (
        <RegistrationInProgress
          domainName={displayDomainName}
          onRegistrationSuccess={handleRegistrationSuccess}
        />
      )}

      {step === RegistrationStep.REGISTRATION_SUCCESS && (
        <RegistrationSuccess
          domainName={displayDomainName}
          onSetupAutorenewal={handleSetupAutorenewal}
        />
      )}

      {step === RegistrationStep.AUTORENEWAL && (
        <Autorenewal domainName={displayDomainName} duration={duration} />
      )}
    </div>
  )
}
