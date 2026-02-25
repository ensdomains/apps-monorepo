import { registrationMachine } from '@ens-apps/transaction-manager'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useActorRef, useSelector } from '@xstate/react'
import { AlertCircle, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { sepolia } from 'viem/chains'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { MessageCard } from '@/components/ui/message-card'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { useStartRegistration } from '@/features/register/hooks/useStartRegistration'
import {
  formatDurationLabel,
  getDurationInSecondsFromYears,
} from '@/features/register/utils/registrationDuration'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import { validateNameLength } from '@/utils/token/nameValidation'
import { RegisterNameForm } from './RegisterNameForm'
import { RegisterNameCheckoutSummary } from './RegisterNameSummary'
import { RegistrationProgress } from './RegistrationProgress'

type RegisterNameProps = {
  readonly name: string
}

export const RegisterName = ({ name }: RegisterNameProps) => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isNavigatingToProfile, setIsNavigatingToProfile] = useState(false)

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
    refetch,
  } = useQuery({
    ...getNameAvailabilityQueryOptions({ name }),
    enabled: Boolean(name) && isNameValid,
  })

  const isNameTaken =
    !isLoading && !isError && availability && !availability.isAvailable

  const handleViewProfile = async () => {
    setIsNavigatingToProfile(true)
    try {
      await pollForIndexerSync({
        invalidateQueries: async () => {
          await queryClient.invalidateQueries({
            queryKey: getEnsOwnerQueryOptions({ name }).queryKey,
            refetchType: 'all',
          })
          await queryClient.invalidateQueries({
            queryKey: getNameAvailabilityQueryOptions({ name }).queryKey,
            refetchType: 'all',
          })
          await queryClient.invalidateQueries({
            queryKey: getProfileQueryOptions(name).queryKey,
            refetchType: 'all',
          })
        },
      })
      navigate({ to: '/$name', params: { name } })
    } finally {
      setIsNavigatingToProfile(false)
    }
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

  if (isError) {
    return (
      <MessageCard
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
          <RegisterNameCheckoutSummary
            name={name}
            duration={duration}
            durationLabel={formatDurationLabel(duration)}
            onContinue={startRegistration}
          />
        </>
      ) : (
        <RegistrationProgress
          domainName={name}
          actor={actor}
          onViewProfile={handleViewProfile}
          isViewProfileLoading={isNavigatingToProfile}
        />
      )}
    </main>
  )
}
