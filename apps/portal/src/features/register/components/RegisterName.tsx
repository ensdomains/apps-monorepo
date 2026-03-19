import { registrationMachine } from '@ens-apps/transaction-manager'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useQuery } from '@tanstack/react-query'
import { useActorRef, useSelector } from '@xstate/react'
import { AlertCircle, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { sepolia } from 'viem/chains'
import { useConnection } from 'wagmi'
import { InvalidNameMessage } from '@/components/InvalidNameMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { MessageCard } from '@/components/ui/message-card'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'

import { useStartRegistration } from '@/features/register/hooks/useStartRegistration'
import { getDurationInSecondsFromYears } from '@/features/register/utils/registrationDuration'
import {
  validateNameLength,
  validateRegistrableEthName,
} from '@/utils/token/nameValidation'
import { PaymentTokenSection } from './PaymentTokenSection'
import { RegisterNameForm } from './RegisterNameForm'
import { RegisterNameCheckoutSummary } from './RegisterNameSummary'
import { RegistrationProgress } from './RegistrationProgress'

type RegisterNameProps = {
  readonly name: string
}

export const RegisterName = ({ name }: RegisterNameProps) => {
  const [duration, setDuration] = useState<number>(() =>
    getDurationInSecondsFromYears(1),
  )

  const actor = useActorRef(registrationMachine, {
    input: { chainId: sepolia.id },
  })

  const startRegistration = useStartRegistration({
    name,
    duration,
    actor,
  })

  const machineState = useSelector(actor, (state) => state.value)
  const { isConnected } = useConnection()
  const { openConnectModal } = useConnectModal()

  const isIdle = machineState === 'idle'
  const isSuccess = machineState === 'success'

  const registrableEthError = validateRegistrableEthName(name)
  const nameLengthError = validateNameLength(name)
  const isNameValid = !registrableEthError && !nameLengthError

  const {
    data: availability,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    ...getNameAvailabilityQueryOptions({ name }),
    enabled: Boolean(name) && isNameValid,
    // Don't refetch when the registration is successful - this prevents the query from being refetched when the registration is successful
    // for all other states, it important to refetch regularly to check for name availability changes
    // This is to avoid the issue where the name availability is not updated immediately after the registration is successful
    // avoiding users being stuck in endless failure and try again loops.
    refetchInterval: isSuccess ? false : 5000,
  })

  const isNameTaken =
    !isLoading && !isError && availability && !availability.isAvailable

  if (registrableEthError) {
    return (
      <InvalidNameMessage
        title="Invalid name"
        description={registrableEthError}
      />
    )
  }

  if (nameLengthError) {
    return (
      <InvalidNameMessage
        title="Name too short"
        description={nameLengthError}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (isError) {
    return (
      <MessageCard
        variant="danger"
        icon={<AlertCircle className="size-8" strokeWidth={1.5} />}
        title="Could not check availability"
        description={
          <div className="text-base">
            <p>
              We couldn&apos;t verify if this name is available. Please try
              again.
            </p>
          </div>
        }
        badge="Alpha"
        actionButton={{
          label: 'Try again',
          onClick: () => refetch(),
        }}
      />
    )
  }

  if (isNameTaken) {
    return (
      <MessageCard
        icon={<UserCheck className="size-8" strokeWidth={1.5} />}
        title={`${name} is already registered`}
        description={
          <div className="text-base">
            <p>
              This name is already registered. View its profile to see details
              and records.
            </p>
          </div>
        }
        badge="Alpha"
        actionButton={{
          label: `View ${name}`,
          href: `/${name}`,
        }}
      />
    )
  }

  return (
    <main className="flex-1 mx-auto w-full max-w-xl px-6 py-8 flex flex-col gap-8">
      {isIdle ? (
        <>
          <RegisterNameForm
            name={name}
            duration={duration}
            setDuration={setDuration}
          />
          <RegisterNameCheckoutSummary name={name} duration={duration} />
          <PaymentTokenSection
            name={name}
            duration={duration}
            onConfirm={startRegistration}
            onConnectWallet={openConnectModal}
            isConnected={isConnected}
          />
        </>
      ) : (
        <RegistrationProgress domainName={name} actor={actor} />
      )}
    </main>
  )
}
