import { useQueries, useQuery } from '@tanstack/react-query'
import { CalendarIcon, ClockIcon } from 'lucide-react'
import { useBlock } from 'wagmi'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { BlockCard } from '@/features/dashboard/components'
import { Timestamp } from '@/features/profile/components/Timestamp'
import { getNameHistoryQueryOptions } from '@/features/profile/hooks/useNameHistory'
import { getV1ExpiryQueryOptions } from '@/features/profile/hooks/useV1Expiry'
import { getV2RegistrationDataQueryOptions } from '@/features/profile/hooks/useV2RegistrationData'
import type { ProtocolVersion } from '@/utils/types'

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
    <BlockCard className="gap-3">
      <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
        <div className="flex items-center gap-2 text-muted-foreground min-w-0">
          <CalendarIcon className="size-4 shrink-0" />
          <span className="text-sm truncate">Registered</span>
        </div>
        <span className="text-sm font-medium text-foreground shrink-0">
          <RegistrationDate blockNumber={blockNumber} />
        </span>
      </div>
    </BlockCard>
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
      {expiry.data && (
        <BlockCard className="gap-3">
          <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
            <div className="flex items-center gap-2 text-muted-foreground min-w-0">
              <ClockIcon className="size-4 shrink-0" />
              <span className="text-sm truncate">Expiry</span>
            </div>
            <span className="text-sm font-medium text-foreground shrink-0">
              <Timestamp timestamp={expiry.data.expiry} />
            </span>
          </div>
        </BlockCard>
      )}
      {blockNumber && <RegistrationData blockNumber={blockNumber} />}
      {expiry.data?.gracePeriod && (
        <BlockCard className="gap-3">
          <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
            <div className="flex items-center gap-2 text-muted-foreground min-w-0">
              <CalendarIcon className="size-4 shrink-0" />
              <span className="text-sm truncate">Grace</span>
            </div>
            <span className="text-sm font-medium text-foreground shrink-0">
              <Timestamp timestamp={expiry.data.gracePeriod} />
            </span>
          </div>
        </BlockCard>
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
      {!!data.registeredAt && (
        <BlockCard className="gap-3">
          <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
            <div className="flex items-center gap-2 text-muted-foreground min-w-0">
              <CalendarIcon className="size-4 shrink-0" />
              <span className="text-sm truncate">Registered</span>
            </div>
            <span className="text-sm font-medium text-foreground shrink-0">
              <Timestamp timestamp={data.registeredAt} />
            </span>
          </div>
        </BlockCard>
      )}
      {!!data.expiry && (
        <BlockCard className="gap-3">
          <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
            <div className="flex items-center gap-2 text-muted-foreground min-w-0">
              <ClockIcon className="size-4 shrink-0" />
              <span className="text-sm truncate">Expiry</span>
            </div>
            <span className="text-sm font-medium text-foreground shrink-0">
              <Timestamp timestamp={data.expiry} />
            </span>
          </div>
        </BlockCard>
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
    <div className="w-full flex flex-col lg:flex-row gap-4 lg:gap-6">
      {protocolVersion === 'ENSv1' ? (
        <V1ExpiryWithRegistrationData name={name} />
      ) : (
        <V2ExpiryWithRegistrationData name={name} />
      )}
    </div>
  )
}
