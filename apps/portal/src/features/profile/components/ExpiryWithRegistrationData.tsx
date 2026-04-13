import { useQueries, useQuery } from '@tanstack/react-query'
import { CalendarIcon, ClockIcon, PlusCircleIcon } from 'lucide-react'
import { useBlock } from 'wagmi'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Label } from '@/components/ui/label'
import type { ProtocolVersion } from '@/utils/types'
import { getNameHistoryQueryOptions } from '../hooks/useNameHistory'
import { getV1ExpiryQueryOptions } from '../hooks/useV1Expiry'
import { getV2RegistrationDataQueryOptions } from '../hooks/useV2RegistrationData'
import { Timestamp } from './Timestamp'

interface RegistrationDateProps {
  blockNumber: number | bigint
}

const RegistrationDate = ({ blockNumber }: RegistrationDateProps) => {
  const { data, isLoading, error } = useBlock({
    blockNumber: BigInt(blockNumber),
  })

  if (error) return <div>Error: {error.message}</div>
  if (isLoading) return <LoadingSpinner title="Loading..." />

  if (!data) return null

  return <Timestamp timestamp={data.timestamp} />
}

type RegistrationDataProps = RegistrationDateProps

const RegistrationData = ({ blockNumber }: RegistrationDataProps) => {
  return (
    <div className="flex flex-col gap-1">
      <Label>Registered</Label>
      <span className="flex flex-row gap-1 items-center h-9.5 text-foreground">
        <CalendarIcon className="size-3.5 text-muted-foreground" />
        <RegistrationDate blockNumber={blockNumber} />
      </span>
    </div>
  )
}

const V1ExpiryWithRegistrationData = ({ name }: { name: string }) => {
  const [nameHistory, expiry] = useQueries({
    queries: [
      getNameHistoryQueryOptions({ name, orderDirection: 'asc', first: 1 }),
      getV1ExpiryQueryOptions({ name }),
    ],
  })

  if (expiry.error)
    return <div>Failed to fetch expiry: {expiry.error.cause.message}</div>
  if (nameHistory.error)
    return (
      <div>Failed to fetch name history: {nameHistory.error.cause.message}</div>
    )

  if (expiry.isLoading || nameHistory.isLoading)
    return <LoadingSpinner title="Loading expiry and registration data" />

  const blockNumber = nameHistory.data?.registrationEvents?.find(
    (event) => event.type === 'NameRegistered',
  )?.blockNumber

  return (
    <>
      {blockNumber && <RegistrationData blockNumber={blockNumber} />}
      {expiry.data && (
        <div className="flex flex-col gap-1">
          <Label>Expires</Label>
          <span className="flex flex-row gap-1 items-center h-9.5 text-foreground">
            <ClockIcon className="size-3.5 text-muted-foreground" />
            <Timestamp timestamp={expiry.data.expiry} />
          </span>
        </div>
      )}
    </>
  )
}

const V2ExpiryWithRegistrationData = ({ name }: { name: string }) => {
  const { data, error, isLoading } = useQuery(
    getV2RegistrationDataQueryOptions({ name }),
  )

  if (error)
    return (
      <div>
        Failed to fetch registration data:{' '}
        {error.cause?.message || error.message}
      </div>
    )

  if (isLoading)
    return <LoadingSpinner title="Loading expiry and registration data" />

  if (!data) return null

  return (
    <>
      {data.createdAt !== null && (
        <div className="flex flex-col gap-1">
          <Label>Created</Label>
          <span className="flex flex-row gap-1 items-center h-9.5 text-foreground">
            <PlusCircleIcon className="size-3.5 text-muted-foreground" />
            {new Date(Number(data.createdAt) * 1000).toUTCString()}
          </span>
        </div>
      )}

      {data.registeredAt !== null && (
        <div className="flex flex-col gap-1">
          <Label>Registered</Label>
          <span className="flex flex-row gap-1 items-center h-9.5">
            <CalendarIcon className="size-3.5" />
            {new Date(Number(data.registeredAt) * 1000).toUTCString()}
          </span>
        </div>
      )}

      {data.expiry !== null && (
        <div className="flex flex-col gap-1">
          <Label>Expires</Label>
          <span className="flex flex-row gap-1 items-center h-9.5 text-foreground">
            <ClockIcon className="size-3.5 text-muted-foreground" />
            {new Date(Number(data.expiry) * 1000).toUTCString()}
          </span>
        </div>
      )}
    </>
  )
}

interface ExpiryWithRegistrationDataProps {
  name: string
  protocolVersion: ProtocolVersion
}

export const ExpiryWithRegistrationData = ({
  name,
  protocolVersion,
}: ExpiryWithRegistrationDataProps) => {
  return (
    <div className="w-full flex flex-col justify-between p-6 gap-4 rounded-lg border border-border lg:col-span-1">
      {protocolVersion === 'ENSv1' ? (
        <V1ExpiryWithRegistrationData name={name} />
      ) : (
        <V2ExpiryWithRegistrationData name={name} />
      )}
    </div>
  )
}
