import { makeLabelNodeAndParent } from '@ensdomains/ensjs/utils'
import { useQueries } from '@tanstack/react-query'
import { CalendarIcon, ClockIcon } from 'lucide-react'
import { useBlock } from 'wagmi'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { Label } from '@/components/ui/label'
import type { EnsNetworkName } from '@/utils/types'
import { getNameHistoryQueryOptions } from '../hooks/useNameHistory'
import { getV1ExpiryQueryOptions } from '../hooks/useV1Expiry'
import { getV2ExpiryQueryOptions } from '../hooks/useV2Expiry'
import { getV2RegistrationDateQueryOptions } from '../hooks/useV2RegistrationDate'

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

  return new Date(Number(data.timestamp) * 1000).toUTCString()
}

type RegistrationDataProps = RegistrationDateProps

const RegistrationData = ({ blockNumber }: RegistrationDataProps) => {
  return (
    <div className="flex flex-col gap-1">
      <Label>Registered</Label>
      <span className="flex flex-row gap-1 items-center h-[38px]">
        <CalendarIcon className="size-3.5" />
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
          <span className="flex flex-row gap-1 items-center h-[38px]">
            <ClockIcon className="size-3.5" />
            {new Date(Number(expiry.data.expiry) * 1000).toUTCString()}
          </span>
        </div>
      )}
    </>
  )
}

const V2ExpiryWithRegistrationData = ({ name }: { name: string }) => {
  const { label } = makeLabelNodeAndParent(name)

  const [registrationDate, expiry] = useQueries({
    queries: [
      getV2RegistrationDateQueryOptions({
        label,
        fromBlock: 9792514n, // V2 Registry deployment block on namechain-sepolia
      }),
      getV2ExpiryQueryOptions({ name }),
    ],
  })

  if (expiry.error)
    return <div>Failed to fetch expiry: {expiry.error.cause.message}</div>

  if (registrationDate.error)
    return (
      <div>
        Failed to registration date: {registrationDate.error.cause.message}
      </div>
    )

  if (expiry.isLoading || registrationDate.isLoading)
    return <LoadingSpinner title="Loading expiry and registration data" />

  return (
    <>
      {registrationDate.data && (
        <div className="flex flex-col gap-1">
          <Label>Registered</Label>
          <span className="flex flex-row gap-1 items-center h-[38px]">
            <CalendarIcon className="size-3.5" />
            {new Date(Number(registrationDate.data) * 1000).toUTCString()}
          </span>
        </div>
      )}
      {expiry.data && (
        <div className="flex flex-col gap-1">
          <Label>Expires</Label>
          <span className="flex flex-row gap-1 items-center h-[38px]">
            <ClockIcon className="size-3.5" />
            {new Date(Number(expiry.data) * 1000).toUTCString()}
          </span>
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
    <div className="w-full flex flex-col p-6 gap-4 rounded-lg border border-gray-300 lg:col-span-1">
      {network === 'sepolia' ? (
        <V1ExpiryWithRegistrationData name={name} />
      ) : (
        <V2ExpiryWithRegistrationData name={name} />
      )}
    </div>
  )
}
