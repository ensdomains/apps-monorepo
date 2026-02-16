import { useQuery } from '@tanstack/react-query'
import { UserCheck } from 'lucide-react'
import { Fragment, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { MessageCard } from '@/components/ui/message-card'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { run } from '@/utils/run'
import { RegisterNameForm } from './RegisterNameForm'
import { RegisterNameCheckoutSummary } from './RegisterNameSummary'

type RegisterNameProps = {
  name: string
}

export const RegisterName = ({ name }: RegisterNameProps) => {
  const [duration, setDuration] = useState(1)

  const {
    data: availability,
    isLoading,
    isError,
  } = useQuery({
    ...getNameAvailabilityQueryOptions({ name }),
    enabled: Boolean(name),
  })

  const isNameAvailable =
    !isLoading && !isError && availability && !availability.isAvailable

  return (
    <main className="flex-1 mx-auto w-full max-w-6xl px-6 grid grid-cols-1 lg:grid-cols-5">
      {run(() => {
        if (isLoading) {
          return (
            <div className="flex-1 flex items-center justify-center py-12 col-span-5">
              <LoadingSpinner />
            </div>
          )
        }

        if (isNameAvailable) {
          return (
            <div className="col-span-5">
              <MessageCard
                icon={<UserCheck className="size-8" strokeWidth={1.5} />}
                title={`${name} is already registered`}
                description={
                  <div className="text-base">
                    <p>
                      This name is already registered. View its profile to see
                      details and records.
                    </p>
                  </div>
                }
                badge="Alpha"
                actionButton={{
                  label: `View ${name}`,
                  href: `/${name}`,
                }}
              />
            </div>
          )
        }

        return (
          <Fragment>
            <RegisterNameForm
              name={name}
              duration={duration}
              setDuration={setDuration}
            />
            <RegisterNameCheckoutSummary name={name} duration={duration} />
          </Fragment>
        )
      })}
    </main>
  )
}
