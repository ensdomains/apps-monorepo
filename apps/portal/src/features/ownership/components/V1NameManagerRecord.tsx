import { useQuery } from '@tanstack/react-query'
import { ShieldPersonIcon } from '@/assets/icons'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { getV1NameManagerQueryOptions } from '@/features/ownership/queries/getV1NameManager'
import { InfoRow } from '@/features/profile/components/InfoRow'
import { Owner } from '@/features/profile/components/Owner'

export const V1NameManagerRecord = ({
  name,
  className,
  asRow,
}: {
  name: string
  className?: string
  asRow?: boolean
}) => {
  const {
    data: managerAddress,
    isLoading,
    error,
  } = useQuery(getV1NameManagerQueryOptions({ name }))

  // Row-shaped transient states: the full-size Loading/Error blocks would
  // break the compact header list this renders inside when `asRow` is set.
  if (error) {
    if (asRow)
      return (
        <InfoRow icon={ShieldPersonIcon} label="Manager" className={className}>
          <span className="text-base text-muted-foreground">
            Failed to load manager
          </span>
        </InfoRow>
      )
    return (
      <ErrorMessage
        compact
        description="Error fetching the manager. Please refresh the page."
      />
    )
  }
  if (isLoading) {
    if (asRow)
      return (
        <InfoRow icon={ShieldPersonIcon} label="Manager" className={className}>
          <span className="text-base text-muted-foreground">Loading</span>
        </InfoRow>
      )
    return <LoadingMessage title="Loading manager" />
  }

  // A wrapped name: the NameWrapper holds the slot, so the Owner row's account
  // is the only one in control.
  if (!managerAddress) return null

  return (
    <Owner
      label="Manager"
      owner={managerAddress}
      className={className}
      asRow={asRow}
    />
  )
}
