import { useQueries, useQuery } from '@tanstack/react-query'
import { CalendarIcon, ClockIcon, PlusCircleIcon } from 'lucide-react'
import { useBlock } from 'wagmi'
import { LoadingSpinner } from '@/components/LoadingSpinner'
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
    <div className="flex items-center gap-4 py-3">
      <CalendarIcon className="size-4 text-muted-foreground shrink-0" />
      <span className="text-sm text-muted-foreground w-24 shrink-0">
        Registered
      </span>
      <RegistrationDate blockNumber={blockNumber} />
    </div>
  )
}

const V1ExpiryWithRegistrationData = ({ name }: { name: string }) => {
  const [nameHistory, expiry, indexerData] = useQueries({
    queries: [
      getNameHistoryQueryOptions({ name, orderDirection: 'asc', first: 1 }),
      getV1ExpiryQueryOptions({ name }),
      getV2RegistrationDataQueryOptions({ name }),
    ],
  })

  if (expiry.error)
    return <div>Failed to fetch expiry: {expiry.error.cause.message}</div>
  if (nameHistory.error)
    return (
      <div>Failed to fetch name history: {nameHistory.error.cause.message}</div>
    )

  if (expiry.isLoading || nameHistory.isLoading || indexerData.isLoading)
    return <LoadingSpinner title="Loading expiry and registration data" />

  const blockNumber = nameHistory.data?.registrationEvents?.find(
    (event) => event.type === 'NameRegistered',
  )?.blockNumber

  const registeredAt = indexerData.data?.registeredAt || null
  const createdAt = indexerData.data?.createdAt || null

  return (
    <>
      {expiry.data && (
        <div className="flex items-center gap-4 py-3">
          <ClockIcon className="size-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground w-24 shrink-0">
            Expires
          </span>
          <Timestamp timestamp={expiry.data.expiry} />
        </div>
      )}
      {blockNumber ? (
        <RegistrationData blockNumber={blockNumber} />
      ) : (
        registeredAt !== null && (
          <div className="flex items-center gap-4 py-3">
            <CalendarIcon className="size-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground w-24 shrink-0">
              Registered
            </span>
            <Timestamp timestamp={registeredAt} />
          </div>
        )
      )}
      {!blockNumber && createdAt !== null && (
        <div className="flex items-center gap-4 py-3">
          <PlusCircleIcon className="size-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground w-24 shrink-0">
            Created
          </span>
          <Timestamp timestamp={createdAt} />
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
      {data.expiry !== null && (
        <div className="flex items-center gap-4 py-3">
          <ClockIcon className="size-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground w-24 shrink-0">
            Expires
          </span>
          <Timestamp timestamp={data.expiry} />
        </div>
      )}

      {data.registeredAt !== null && (
        <div className="flex items-center gap-4 py-3">
          <CalendarIcon className="size-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground w-24 shrink-0">
            Registered
          </span>
          <Timestamp timestamp={data.registeredAt} />
        </div>
      )}

      {data.createdAt !== null && (
        <div className="flex items-center gap-4 py-3">
          <PlusCircleIcon className="size-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground w-24 shrink-0">
            Created
          </span>
          <Timestamp timestamp={data.createdAt} />
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
  return protocolVersion === 'ENSv1' ? (
    <V1ExpiryWithRegistrationData name={name} />
  ) : (
    <V2ExpiryWithRegistrationData name={name} />
  )
}
