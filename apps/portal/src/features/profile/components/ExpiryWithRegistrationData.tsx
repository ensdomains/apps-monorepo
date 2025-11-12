import { useQuery } from '@tanstack/react-query'
import { CalendarIcon, ClockIcon } from 'lucide-react'
import { useBlock } from 'wagmi'
import { Label } from '@/components/ui/label'
import { getExpiryQueryOptions } from '../hooks/useExpiryData'
import { getNameHistoryQueryOptions } from '../hooks/useNameHistory'

interface ExpiryProps {
  name: string
}

const Expiry = ({ name }: ExpiryProps) => {
  const { data, isLoading, error } = useQuery(getExpiryQueryOptions({ name }))

  if (error) return <div>Error: {error.message}</div>
  if (isLoading) return <div>Loading...</div>

  if (!data) return <div>No expiry data</div>

  if (data.status !== 'expired')
    return (
      <div className="flex flex-col gap-1">
        <Label>Expires</Label>
        <span className="flex flex-row gap-1 items-center h-[38px]">
          <ClockIcon className="size-3.5" />
          {new Date(Number(data.expiry) * 1000).toUTCString()}
        </span>
      </div>
    )
  return null
}

interface RegistrationDateProps {
  event: { blockNumber: number }
}

const RegistrationDate = ({ event }: RegistrationDateProps) => {
  const { data, isLoading, error } = useBlock({
    blockNumber: BigInt(event.blockNumber),
  })

  if (error) return <div>Error: {error.message}</div>
  if (isLoading) return <div>Loading...</div>

  if (!data) return null

  return new Date(Number(data.timestamp) * 1000).toUTCString()
}

interface RegistrationDataProps {
  name: string
}

const RegistrationData = ({ name }: RegistrationDataProps) => {
  const { data, isLoading, error } = useQuery(
    getNameHistoryQueryOptions({ name, orderDirection: 'asc', first: 1 }),
  )

  if (error) return <div>Error: {error.cause?.message}</div>
  if (isLoading) return <div>Loading...</div>

  if (!data?.registrationEvents) return <div>No registration data</div>

  const registrationEvent = data.registrationEvents.find(
    (event) => event.type === 'NameRegistered',
  )

  if (!registrationEvent) return <div>No registration data</div>

  return (
    <div className="flex flex-col gap-1">
      <Label>Registered</Label>
      <span className="flex flex-row gap-1 items-center h-[38px]">
        <CalendarIcon className="size-3.5" />
        <RegistrationDate event={registrationEvent} />
      </span>
    </div>
  )
}

interface ExpiryWithRegistrationDataProps {
  name: string
}

export const ExpiryWithRegistrationData = ({
  name,
}: ExpiryWithRegistrationDataProps) => {
  return (
    <div className="w-full flex flex-col p-6 gap-4 rounded-lg border border-gray-300 lg:col-span-1">
      <Expiry name={name} />
      <RegistrationData name={name} />
    </div>
  )
}
