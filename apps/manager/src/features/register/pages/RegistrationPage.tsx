import { useMachine } from '@xstate/react'
import { useEffect } from 'react'
import { Pricing } from '../components/Pricing'
import {
  RegistrationStep,
  searchMachine,
} from '../machines/registrationMachineMock'

interface RegistrationProps {
  initialName?: string
}

export function Registration({ initialName }: RegistrationProps) {
  const [state, send] = useMachine(searchMachine)

  useEffect(() => {
    if (initialName) {
      send({ type: 'search', name: initialName })
    }
  }, [initialName, send])

  const handleChangeDuration = (duration: number) => {
    send({ type: 'setDuration', duration })
  }

  const handleChangeCurrency = (currencyType: 'ETH' | 'USD') => {
    send({ type: 'setCurrency', currencyType })
  }

  const currentStep = state.context.step
  const name = state.context.name

  return (
    <>
      {currentStep === RegistrationStep.PRICING && name && (
        <div className="mx-auto max-w-md px-4 py-6">
          <Pricing
            domainName={name}
            duration={state.context.duration}
            currency={state.context.currencyType}
            onChangeDuration={handleChangeDuration}
            onChangeCurrency={handleChangeCurrency}
          />
        </div>
      )}
    </>
  )
}
