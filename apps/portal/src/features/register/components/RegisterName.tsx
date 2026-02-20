import { registrationMachine } from '@ens-apps/transaction-manager'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useActorRef, useSelector } from '@xstate/react'
import { AlertCircle, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { sepolia } from 'viem/chains'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { MessageCard } from '@/components/ui/message-card'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { useStartRegistration } from '@/features/register/hooks/useStartRegistration'
import { validateNameLength } from '@/features/register/utils/premium'
import {
  formatRegistrationDuration,
  getDurationInSecondsFromYears,
  getExpiryDateFromSeconds,
} from '@/features/register/utils/registrationDuration'
import { RegisterNameForm } from './RegisterNameForm'
import { RegisterNameCheckoutSummary } from './RegisterNameSummary'
import { RegistrationProgress } from './RegistrationProgress'

type RegisterNameProps = {
  readonly name: string
}

export const RegisterName = ({ name }: RegisterNameProps) => {
  const navigate = useNavigate()

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

  const isIdle = machineState === 'idle'

  const nameLengthError = validateNameLength(name)
  const isNameValid = !nameLengthError

  const {
    data: availability,
    isLoading,
    isError,
  } = useQuery({
    ...getNameAvailabilityQueryOptions({ name }),
    enabled: Boolean(name) && isNameValid,
  })

  const isNameTaken =
    !isLoading && !isError && availability && !availability.isAvailable

  const handleViewProfile = () => {
    navigate({ to: '/$name', params: { name } })
  }

  if (nameLengthError) {
    return (
      <MessageCard
        icon={<AlertCircle className="size-8" strokeWidth={1.5} />}
        title="Name too short"
        description={
          <div className="text-base">
            <p>{nameLengthError}</p>
          </div>
        }
        badge="Alpha"
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
          <RegisterNameCheckoutSummary
            name={name}
            duration={duration}
            durationLabel={formatRegistrationDuration(
              getExpiryDateFromSeconds(duration),
            )}
            onContinue={startRegistration}
          />
        </>
      ) : (
        <RegistrationProgress
          domainName={name}
          actor={actor}
          onViewProfile={handleViewProfile}
        />
      )}
    </main>
  )
}
