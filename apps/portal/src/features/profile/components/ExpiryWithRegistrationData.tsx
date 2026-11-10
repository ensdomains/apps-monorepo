import { useQuery } from '@tanstack/react-query'
import { CalendarIcon, ClockIcon } from 'lucide-react'
import { match, P } from 'ts-pattern'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useBlockExplorerTxUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { formatTimestampDate } from '@/utils/formatting/formatTimestamp'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import {
  ethAncestorsOf,
  getResolvingExpiry,
  type ResolvingExpiry,
} from '@/utils/names/addressNames'
import type { ProtocolVersion } from '@/utils/types'
import { useEarliestExpiry } from '../hooks/useEarliestExpiry'
import { useGraceStatus } from '../hooks/useGraceStatus'
import {
  getRegistrationDataQueryOptions,
  getRegistrationTxQueryOptions,
} from '../hooks/useRegistrationData'
import { InfoRow } from './InfoRow'
import { Timestamp } from './Timestamp'

/**
 * "Registered" row: bigname's `registered_at`, linked to the registration
 * transaction when history has it.
 */
const RegisteredRow = ({
  name,
  registeredAt,
}: {
  readonly name: string
  readonly registeredAt: number
}) => {
  const { data: registrationTxHash } = useQuery(
    getRegistrationTxQueryOptions({ name, registeredAt }),
  )
  const registrationTxUrl = useBlockExplorerTxUrl(
    registrationTxHash ?? undefined,
  )

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

/** When an ENSv2 subname stops resolving because a name above it expires first. */
const StopsResolvingRow = ({
  resolving,
}: {
  readonly resolving: ResolvingExpiry
}) =>
  match(resolving)
    .with(
      { type: P.union('parentFirst', 'parent'), date: P.instanceOf(Date) },
      ({ date }) => (
        <InfoRow icon={ClockIcon} label="Stops resolving">
          <span className="font-semi-mono">
            <Timestamp timestamp={Math.floor(date.getTime() / 1000)} />
          </span>
        </InfoRow>
      ),
    )
    .with({ type: 'parent' }, () => (
      <InfoRow icon={ClockIcon} label="Stops resolving">
        When its parent expires
      </InfoRow>
    ))
    .otherwise(() => null)

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
  const expiryDate = data?.expiry ? new Date(data.expiry * 1000) : null
  // An ENSv1 subname keeps resolving past its parent's lease, so only ENSv2 gets the row.
  const ancestors =
    protocolVersion === 'ENSv2'
      ? ethAncestorsOf({ name, expiryDate, protocolVersion })
      : []
  const ancestorExpiry = useEarliestExpiry(ancestors)

  if (error)
    return (
      <ErrorMessage
        compact
        description="Error fetching registration data. Please refresh the page."
      />
    )

  if (isLoading || ancestorExpiry.isLoading)
    return <LoadingSpinner title="Loading expiry and registration data" />

  if (!data) return null

  const graceEndDate = grace.isInGrace ? grace.graceEndDate : undefined
  const showsExpiry =
    data.expiry !== null && (protocolVersion === 'ENSv1' || !graceEndDate)
  const resolving = getResolvingExpiry({
    expiryDate,
    parentExpiryDate:
      ancestors.length > 0 ? ancestorExpiry.earliestExpiry : undefined,
  })

  return (
    <>
      {showsExpiry && data.expiry !== null && (
        <ExpiresRow expiry={data.expiry} />
      )}
      <StopsResolvingRow resolving={resolving} />
      {data.registeredAt !== null && (
        <RegisteredRow name={name} registeredAt={data.registeredAt} />
      )}
      {graceEndDate && <GraceEndsRow graceEndDate={graceEndDate} />}
    </>
  )
}
