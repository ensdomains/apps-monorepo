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
import { getV2RegistrationDataQueryOptions } from '../hooks/useV2RegistrationData'
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

/**
 * ENSv1: "Expires" is the BaseRegistrar lease (`ens_v1.expires_at`), not the
 * ENSv2 reservation bigname serves at the top level, and "Grace ends" is the
 * lease's 90-day grace. Both come from bigname with the registration date;
 * the on-chain expiry read is gone.
 */
const V1ExpiryWithRegistrationData = ({ name }: { name: string }) => {
  const grace = useGraceStatus({ name, protocolVersion: 'ENSv1' })

  const { data, error, isLoading } = useQuery(
    getV2RegistrationDataQueryOptions({ name }),
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

  return (
    <>
      {data.expiry !== null && (
        <InfoRow icon={ClockIcon} label="Expires">
          <span className="font-semi-mono">
            <Timestamp timestamp={data.expiry} />
          </span>
        </InfoRow>
      )}
      {data.registeredAt !== null && (
        <RegisteredRow name={name} registeredAt={data.registeredAt} />
      )}
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

  return (
    <>
      {grace.isInGrace && grace.graceEndDate ? (
        <GraceEndsRow graceEndDate={grace.graceEndDate} />
      ) : (
        data.expiry !== null && (
          <InfoRow icon={ClockIcon} label="Expires">
            <div className="font-semi-mono pt-2 pb-3">
              <Timestamp timestamp={data.expiry} />
            </div>
          </InfoRow>
        )
      )}

      {data.registeredAt !== null && (
        <RegisteredRow name={name} registeredAt={data.registeredAt} />
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
