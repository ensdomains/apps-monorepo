import { useQuery } from '@tanstack/react-query'
import { CalendarIcon, ClockIcon } from 'lucide-react'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useBlockExplorerTxUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { formatTimestampDate } from '@/utils/formatting/formatTimestamp'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import type { ProtocolVersion } from '@/utils/types'
import { useGraceStatus } from '../hooks/useGraceStatus'
import { getNameHistoryQueryOptions } from '../hooks/useNameHistory'
import { getRegistrationDataQueryOptions } from '../hooks/useRegistrationData'
import { InfoRow } from './InfoRow'
import { Timestamp } from './Timestamp'

/**
 * The transaction that registered the name: the oldest `registration` row in
 * its history. bigname orders by chain position before truncating, so
 * `order: 'asc'` with one row is the earliest registration, not a window of
 * recent history.
 */
const useRegistrationTxHash = (name: string) => {
  const { data } = useQuery(
    getNameHistoryQueryOptions({
      name,
      type: ['registration'],
      order: 'asc',
      page_size: 1,
    }),
  )
  return data?.[0]?.transaction_hash ?? undefined
}

/**
 * "Registered" row: bigname's `registered_at`, linked to the registration
 * transaction when history has it.
 */
const RegisteredRow = ({
  name,
  registeredAt,
}: {
  name: string
  registeredAt: number
}) => {
  const registrationTxHash = useRegistrationTxHash(name)
  const registrationTxUrl = useBlockExplorerTxUrl(registrationTxHash)

  return (
    <InfoRow icon={CalendarIcon} label="Registered">
      {registrationTxHash ? (
        <EntityBadge
          variant="tx"
          label={formatTimestampDate(registeredAt) ?? '—'}
          etherscanHref={registrationTxUrl}
          copyValue={registrationTxHash}
        >
          {truncateAddress(registrationTxHash, 6, 4)}
        </EntityBadge>
      ) : (
        <span className="font-semi-mono">
          <Timestamp timestamp={registeredAt} />
        </span>
      )}
    </InfoRow>
  )
}

const GraceEndsRow = ({ graceEndDate }: { graceEndDate: Date }) => (
  <InfoRow icon={CalendarIcon} label="Grace ends">
    <Timestamp timestamp={Math.floor(graceEndDate.getTime() / 1000)} />
  </InfoRow>
)

const ExpiresRow = ({ expiry }: { expiry: number }) => (
  <InfoRow icon={ClockIcon} label="Expires">
    <span className="font-semi-mono">
      <Timestamp timestamp={expiry} />
    </span>
  </InfoRow>
)

interface ExpiryWithRegistrationDataProps {
  name: string
  protocolVersion: ProtocolVersion
}

/**
 * A name's expiry, grace and registration rows. For ENSv1 "Expires" is the
 * BaseRegistrar lease, not the ENSv2 reservation bigname serves at the top
 * level, and it stays shown beside the lease's 90-day grace; an ENSv2 name in
 * grace shows when grace ends instead.
 */
export const ExpiryWithRegistrationData = ({
  name,
  protocolVersion,
}: ExpiryWithRegistrationDataProps) => {
  const grace = useGraceStatus({ name, protocolVersion })
  const { data, error, isLoading } = useQuery(
    getRegistrationDataQueryOptions({ name }),
  )

  if (error)
    return (
      <ErrorMessage
        compact
        description="Error fetching registration data. Please refresh the page."
      />
    )

  if (isLoading)
    return <LoadingSpinner title="Loading expiry and registration data" />

  if (!data) return null

  const graceEndDate = grace.isInGrace ? grace.graceEndDate : undefined
  const showsExpiry =
    data.expiry !== null && (protocolVersion === 'ENSv1' || !graceEndDate)

  return (
    <>
      {showsExpiry && data.expiry !== null && (
        <ExpiresRow expiry={data.expiry} />
      )}
      {data.registeredAt !== null && (
        <RegisteredRow name={name} registeredAt={data.registeredAt} />
      )}
      {graceEndDate && <GraceEndsRow graceEndDate={graceEndDate} />}
    </>
  )
}
