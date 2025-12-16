import { useQueries, useQuery } from '@tanstack/react-query'
import { CalendarIcon, ClockIcon } from 'lucide-react'
import { useBlock } from 'wagmi'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { Timestamp } from '@/features/profile/components/Timestamp'
import { getNameHistoryQueryOptions } from '@/features/profile/hooks/useNameHistory'
import { getV1ExpiryQueryOptions } from '@/features/profile/hooks/useV1Expiry'
import { getV2RegistrationDataQueryOptions } from '@/features/profile/hooks/useV2RegistrationData'
import type { EnsNetworkName } from '@/utils/types'

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
    <div className="w-full flex flex-row gap-4 lg:gap-6 p-4 lg:p-6 items-center border border-gray-300 rounded-2xl">
      <CalendarIcon className="p-2 size-9 rounded-4xl bg-secondary" />
      <div className="flex flex-col">
        <span className="font-medium">Registered</span>
        <RegistrationDate blockNumber={blockNumber} />
      </div>
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
      {expiry.data && (
        <div className="flex flex-row gap-4 w-full lg:gap-6 p-4 lg:p-6 items-center border border-gray-300 rounded-2xl">
          <ClockIcon className="p-2 size-9 rounded-4xl bg-secondary" />
          <div className="flex flex-col">
            <span className="font-medium">Expiry</span>
            <span className="flex flex-row gap-1 items-center">
              <Timestamp timestamp={expiry.data.expiry} />
            </span>
          </div>
        </div>
      )}
      {blockNumber && <RegistrationData blockNumber={blockNumber} />}
      {expiry.data?.gracePeriod && (
        <div className="flex flex-row gap-4 w-full lg:gap-6 p-4 lg:p-6 items-center border border-gray-300 rounded-2xl">
          <CalendarIcon className="p-2 size-9 rounded-4xl bg-secondary" />
          <div className="flex flex-col">
            <span className="font-medium">Grace</span>
            <span className="flex flex-row gap-1 items-center">
              <Timestamp timestamp={expiry.data.gracePeriod} />
            </span>
          </div>
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
      {data.registeredAt && (
        <div className="w-full flex flex-row gap-4 lg:gap-6 p-4 lg:p-6 items-center border border-gray-300 rounded-2xl">
          <ClockIcon className="p-2 size-9 rounded-4xl bg-secondary" />
          <div className="flex flex-col">
            <span className="font-medium">Registered</span>
            <Timestamp timestamp={data.registeredAt} />
          </div>
        </div>
      )}
      {data.expiry && (
        <div className="w-full flex flex-row gap-4 lg:gap-6 p-4 lg:p-6 items-center border border-gray-300 rounded-2xl">
          <CalendarIcon className="p-2 size-9 rounded-4xl bg-secondary" />
          <div className="flex flex-col">
            <span className="font-medium">Expiry</span>
            <Timestamp timestamp={data.expiry} />
          </div>
        </div>
      )}
    </>
  )
}

interface ExpiryWithRegistrationDataProps {
  name: string
  network: EnsNetworkName
}

export const ExpiryWithRegistrationData = ({
  name,
  network,
}: ExpiryWithRegistrationDataProps) => {
  return (
    <div className="w-full flex flex-col lg:flex-row gap-4 lg:gap-6">
      {network === 'sepolia' ? (
        <V1ExpiryWithRegistrationData name={name} />
      ) : (
        <V2ExpiryWithRegistrationData name={name} />
      )}
    </div>
  )
}
