import { useQuery } from '@tanstack/react-query'
import { UserCheck } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { MessageCard } from '@/components/ui/message-card'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { calculateDurationFromDate } from '@/features/register/utils/registrationDuration'
import { run } from '@/utils/run'
import { RegisterNameForm } from './RegisterNameForm'
import { RegisterNameCheckoutSummary } from './RegisterNameSummary'

type RegisterNameProps = {
  name: string
}

const initialExpiryDate = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d
}

export const RegisterName = ({ name }: RegisterNameProps) => {
  const [expiryDate, setExpiryDate] = useState(initialExpiryDate)
  const duration = useMemo(
    () => calculateDurationFromDate(expiryDate),
    [expiryDate],
  )

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
              expiryDate={expiryDate}
              setExpiryDate={setExpiryDate}
            />
            <RegisterNameCheckoutSummary name={name} duration={duration} />
          </Fragment>
        )
      })}
    </main>
  )
}
