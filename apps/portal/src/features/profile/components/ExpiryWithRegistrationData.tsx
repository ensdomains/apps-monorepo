import { useQueries, useQuery } from '@tanstack/react-query'
import { CalendarIcon, ClockIcon } from 'lucide-react'
import { sepolia } from 'viem/chains'
import { useBlock } from 'wagmi'
import { EntityBadge } from '@/components/EntityBadge'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { formatTimestampDate } from '@/utils/formatting/formatTimestamp'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import type { ProtocolVersion } from '@/utils/types'
import { useGraceStatus } from '../hooks/useGraceStatus'
import { getNameHistoryQueryOptions } from '../hooks/useNameHistory'
import { getV1ExpiryQueryOptions } from '../hooks/useV1Expiry'
import { getV2NameHistoryQueryOptions } from '../hooks/useV2NameHistory'
import { getV2RegistrationDataQueryOptions } from '../hooks/useV2RegistrationData'
import { Timestamp } from './Timestamp'

const sepoliaUrl = sepolia.blockExplorers.default.url

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

  return (
    <span className="font-semi-mono">
      <Timestamp timestamp={data.timestamp} />
    </span>
  )
}

type RegistrationDataProps = RegistrationDateProps

const RegistrationData = ({ blockNumber }: RegistrationDataProps) => {
  return (
    <div className="flex items-center gap-4 min-h-7">
      <CalendarIcon className="size-4 text-neutral-7 shrink-0" />
      <span className="text-sm text-muted-foreground w-24 shrink-0">
        Registered
      </span>
      <RegistrationDate blockNumber={blockNumber} />
    </div>
  )
}

const GraceEndsRow = ({ graceEndDate }: { graceEndDate: Date }) => (
  <div className="flex items-center gap-4 min-h-7">
    <CalendarIcon className="size-4 text-neutral-7 shrink-0" />
    <span className="text-sm text-muted-foreground w-24 shrink-0">
      Grace ends
    </span>
    <Timestamp timestamp={Math.floor(graceEndDate.getTime() / 1000)} />
  </div>
)

const V1ExpiryWithRegistrationData = ({ name }: { name: string }) => {
  const grace = useGraceStatus({ name, protocolVersion: 'ENSv1' })

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
        <div className="flex items-center gap-4 min-h-7">
          <ClockIcon className="size-4 text-neutral-7 shrink-0" />
          <span className="text-sm text-muted-foreground w-24 shrink-0">
            Expires
          </span>
          <span className="font-semi-mono">
            <Timestamp timestamp={expiry.data.expiry} />
          </span>
        </div>
      )}
      {blockNumber && <RegistrationData blockNumber={blockNumber} />}
      {grace.isInGrace && grace.graceEndDate && (
        <GraceEndsRow graceEndDate={grace.graceEndDate} />
      )}
    </>
  )
}

const V2ExpiryWithRegistrationData = ({ name }: { name: string }) => {
  const grace = useGraceStatus({ name, protocolVersion: 'ENSv2' })

  const { data, error, isLoading } = useQuery(
    getV2RegistrationDataQueryOptions({ name }),
  )

  const { data: firstEvent } = useQuery(
    getV2NameHistoryQueryOptions({ name, first: 1, orderDirection: 'asc' }),
  )

  const registrationTxHash = firstEvent?.[0]?.transactionHash

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
      {grace.isInGrace && grace.graceEndDate ? (
        <GraceEndsRow graceEndDate={grace.graceEndDate} />
      ) : (
        data.expiry !== null && (
          <div className="flex items-center gap-4 py-3">
            <ClockIcon className="size-4 text-neutral-7 shrink-0" />
            <span className="text-sm text-muted-foreground w-24 shrink-0">
              Expires
            </span>
            <span className="font-semi-mono">
              <Timestamp timestamp={data.expiry} />
            </span>
          </div>
        )
      )}

      {data.registeredAt !== null && (
        <div className="flex items-center gap-4 min-h-7">
          <CalendarIcon className="size-4 text-neutral-7 shrink-0" />
          <span className="text-sm text-muted-foreground w-24 shrink-0">
            Registered
          </span>
          {registrationTxHash ? (
            <EntityBadge
              variant="tx"
              label={formatTimestampDate(data.registeredAt) ?? '—'}
              etherscanHref={`${sepoliaUrl}/tx/${registrationTxHash}`}
              copyValue={registrationTxHash}
              inline
            >
              {truncateAddress(registrationTxHash, 6, 4)}
            </EntityBadge>
          ) : (
            <span className="font-semi-mono">
              <Timestamp timestamp={data.registeredAt} />
            </span>
          )}
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
