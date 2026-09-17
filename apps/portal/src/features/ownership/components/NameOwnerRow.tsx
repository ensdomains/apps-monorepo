import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { ShieldPersonIcon } from '@/assets/icons'
import { InfoRow } from '@/features/profile/components/InfoRow'
import { Owner } from '@/features/profile/components/Owner'
import { getV1NameStateQueryOptions } from '@/features/transfer/v1/getV1NameState'
import { getV1Holder } from '@/features/transfer/v1/rules'
import type { ProtocolVersion } from '@/utils/types'

/**
 * `resolveEnsOwner` reports the *controller* of an unwrapped `.eth` 2LD, so the
 * V1 branch reads the holder from the full V1 shape instead. Its own component
 * because the read depends on `protocolVersion` (STYLEGUIDE, query waterfalls).
 */
const V1OwnerRow = ({
  name,
  label,
  registryOwner,
}: {
  readonly name: string
  readonly label: string
  readonly registryOwner: Address
}) => {
  const { data, isLoading, error } = useQuery(
    getV1NameStateQueryOptions({ name }),
  )

  // Row-shaped states: the full-size blocks would break the header list.
  if (error)
    return (
      <InfoRow icon={ShieldPersonIcon} label={label}>
        <span className="text-sm text-muted-foreground">
          Failed to load owner
        </span>
      </InfoRow>
    )
  if (isLoading)
    return (
      <InfoRow icon={ShieldPersonIcon} label={label}>
        <span className="text-sm text-muted-foreground">Loading</span>
      </InfoRow>
    )
  // No result and no error — a paused query, or no V1 owner at any level.
  if (!data)
    return (
      <InfoRow icon={ShieldPersonIcon} label={label}>
        <span className="text-sm text-muted-foreground">Owner unavailable</span>
      </InfoRow>
    )

  // A lapsed name has no holder — the 721 `ownerOf` reverts in grace.
  return (
    <Owner
      asRow
      label={label}
      owner={data.subject ? getV1Holder(data.subject) : registryOwner}
    />
  )
}

/**
 * The Owner row of a name's header list, on every page that shows one. V1 and
 * V2 disagree about what `owner` means, so the branch lives here rather than in
 * each route — the name page and the ownership page must not name different
 * addresses for the same name (WEB-1468).
 *
 * `owner` is what `resolveEnsOwner` reported; it is used as-is for V2 and as
 * the lapsed-name fallback for V1.
 */
export const NameOwnerRow = ({
  name,
  label = 'Owner',
  owner,
  protocolVersion,
}: {
  readonly name: string
  readonly label?: string
  readonly owner: Address
  readonly protocolVersion: ProtocolVersion
}) =>
  protocolVersion === 'ENSv1' ? (
    <V1OwnerRow name={name} label={label} registryOwner={owner} />
  ) : (
    <Owner asRow label={label} owner={owner} />
  )
