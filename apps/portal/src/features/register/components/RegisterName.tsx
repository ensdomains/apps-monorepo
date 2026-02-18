import { useQuery } from '@tanstack/react-query'
import { AlertCircle, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { MessageCard } from '@/components/ui/message-card'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { validateNameLength } from '@/features/register/utils/premium'
import {
  calculateExpirationDate,
  formatRegistrationDuration,
} from '@/features/register/utils/registrationDuration'
import { RegisterNameForm } from './RegisterNameForm'
import { RegisterNameCheckoutSummary } from './RegisterNameSummary'

type RegisterNameProps = {
  name: string
}

export const RegisterName = ({ name }: RegisterNameProps) => {
  const [duration, setDuration] = useState<number>(1)

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
      <RegisterNameForm
        name={name}
        duration={duration}
        setDuration={setDuration}
      />
      <RegisterNameCheckoutSummary
        name={name}
        duration={duration}
        durationLabel={formatRegistrationDuration(
          calculateExpirationDate(duration),
        )}
        onContinue={(selectedToken) => {
          // TODO: Wire to registration flow (transaction manager) with selectedToken
        }}
      />
    </main>
  )
}
