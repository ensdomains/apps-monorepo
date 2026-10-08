import { useQuery } from '@tanstack/react-query'
import { CircleHelp } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { ShieldPersonIcon } from '@/assets/icons'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useDnsSyncStatus } from '@/features/dns-import/hooks/useDnsSyncStatus'
import { InfoRow } from '@/features/profile/components/InfoRow'
import { Owner } from '@/features/profile/components/Owner'
import { getV1NameStateQueryOptions } from '@/features/transfer/v1/getV1NameState'
import { getV1Holder } from '@/features/transfer/v1/rules'
import type { ProtocolVersion } from '@/utils/types'

/**
 * The owner row's label for an imported DNS name, with the role it names spelt
 * out: the `_ens` TXT address is the root of authority and can take the
 * delegated Manager role back whenever it likes.
 */
const DnsOwnerLabel = () => (
  <Tooltip>
    <TooltipTrigger className="inline-flex items-center gap-1 cursor-help text-ui">
      DNS owner
      <CircleHelp className="size-3.5 shrink-0 text-neutral-7" />
    </TooltipTrigger>
    <TooltipContent className="max-w-xs font-sans normal-case">
      The address in this domain's <code>_ens</code> DNS record. It owns the
      name and can reclaim the Manager role at any time by syncing the manager.
    </TooltipContent>
  </Tooltip>
)

/**
 * The owner row of an onchain-imported DNS name.
 *
 * Its `_ens` TXT record designates the DNS Owner; the v1 registry entry holds
 * the *manager*, a delegated role the DNS Owner revokes by re-running
 * `proveAndClaim` (the Sync Manager flow). Calling that registry address
 * "Owner" overstates it, so this row names the DNS Owner and leaves the
 * on-chain address to the Manager row beside it (`V1NameManagerRecord`).
 *
 * An unreadable record is not an error anywhere else in this feature and isn't
 * one here either — the row says the owner is unknown rather than falling back
 * to the manager, which is the mislabelling this exists to prevent (WEB-125).
 */
const DnsOwnerRow = ({
  dnsOwner,
  isLoading,
}: {
  readonly dnsOwner: Address | null
  readonly isLoading: boolean
}) => {
  if (isLoading)
    return (
      <InfoRow icon={ShieldPersonIcon} label={<DnsOwnerLabel />}>
        <span className="text-sm text-muted-foreground">Loading</span>
      </InfoRow>
    )
  if (!dnsOwner)
    return (
      <InfoRow icon={ShieldPersonIcon} label={<DnsOwnerLabel />}>
        <span className="text-sm text-muted-foreground">
          Could not read the domain's <code>_ens</code> record
        </span>
      </InfoRow>
    )
  return <Owner asRow label={<DnsOwnerLabel />} owner={dnsOwner} />
}

/**
 * `resolveEnsOwner` reports the *controller* of an unwrapped `.eth` 2LD, so the
 * V1 branch reads the holder from the full V1 shape instead. Its own component
 * because the read depends on `protocolVersion` (STYLEGUIDE, query waterfalls).
 *
 * An imported DNS name is the other V1 shape where the registry entry is not
 * ownership: there `resolveEnsOwner` reports the manager, and the owner is the
 * DNS Owner, so the row is handed over to {@link DnsOwnerRow}.
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
  const { address: connectedAddress } = useConnection()
  // Same params (and so the same query key) as the overview's sync check, so
  // this reuses that `_ens` read rather than adding a second DNS lookup.
  const dnsSync = useDnsSyncStatus({
    name,
    manager: registryOwner,
    protocolVersion: 'ENSv1',
    connectedAddress,
  })

  const { data, isLoading, error } = useQuery({
    ...getV1NameStateQueryOptions({ name }),
    // A DNS name has no registrar and no wrapper shape to derive a holder
    // from; the row below answers from the `_ens` record instead.
    enabled: !dnsSync.isDnsManaged,
  })

  if (dnsSync.isDnsManaged)
    return (
      <DnsOwnerRow dnsOwner={dnsSync.dnsOwner} isLoading={dnsSync.isLoading} />
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
 * the lapsed-name fallback for V1. `badge` follows the owner on V2 only, where
 * token roles exist.
 */
export const NameOwnerRow = ({
  name,
  label = 'Owner',
  owner,
  protocolVersion,
  badge,
}: {
  readonly name: string
  readonly label?: string
  readonly owner: Address
  readonly protocolVersion: ProtocolVersion
  readonly badge?: ReactNode
}) =>
  protocolVersion === 'ENSv1' ? (
    <V1OwnerRow name={name} label={label} registryOwner={owner} />
  ) : (
    <Owner asRow label={label} owner={owner} badge={badge} />
  )
