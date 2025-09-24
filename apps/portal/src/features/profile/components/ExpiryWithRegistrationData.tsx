import { useQuery } from '@tanstack/react-query'
import { CalendarIcon, ClockIcon } from 'lucide-react'
import { useBlock } from 'wagmi'
import { Label } from '@/components/ui/label'
import { getExpiryQueryOptions } from '../hooks/useExpiryData'
import { getNameHistoryQueryOptions } from '../hooks/useNameHistory'

const Expiry = ({ name }: { name: string }) => {
  const { data, isLoading, error } = useQuery(getExpiryQueryOptions({ name }))

  if (error) return <div>Error: {error.message}</div>
  if (isLoading) return <div>Loading...</div>

  if (!data) return null

  if (data.status !== 'expired')
    return (
      <div className="flex flex-col gap-1">
        <Label>Expires</Label>
        <span className="flex flex-row gap-1 items-center">
          <ClockIcon height={14} width={14} />
          {new Date(Number(data.expiry) * 1000).toUTCString()}
        </span>
      </div>
    )
  return null
}

const RegistrationDate = ({ event }: { event: { blockNumber: number } }) => {
  const { data, isLoading, error } = useBlock({
    blockNumber: BigInt(event.blockNumber),
  })

  if (error) return <div>Error: {error.message}</div>
  if (isLoading) return <div>Loading...</div>

  if (!data) return null

  return new Date(Number(data.timestamp) * 1000).toUTCString()
}

const RegistrationData = ({ name }: { name: string }) => {
  const { data, isLoading, error } = useQuery(
    getNameHistoryQueryOptions({ name }),
  )

  if (error) return <div>Error: {error.message}</div>
  if (isLoading) return <div>Loading...</div>

  if (!data?.registrationEvents) return null

  const registrationEvent = data.registrationEvents.find(
    (event) => event.type === 'NameRegistered',
  )

  if (!registrationEvent) return null

  return (
    <div className="flex flex-col gap-1">
      <Label>Registered</Label>
      <span className="flex flex-row gap-1 items-center">
        <CalendarIcon height={14} width={14} />
        <RegistrationDate event={registrationEvent} />
      </span>
    </div>
  )
}

export const ExpiryWithRegistrationData = ({ name }: { name: string }) => {
  return (
    <div className="w-full flex flex-col p-6 gap-4 rounded-lg border border-gray-300">
      <Expiry name={name} />
      <RegistrationData name={name} />
    </div>
  )
}
