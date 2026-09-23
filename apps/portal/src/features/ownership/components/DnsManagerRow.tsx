import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { useDnsSyncStatus } from '@/features/dns-import/hooks/useDnsSyncStatus'
import { V1NameManagerRecord } from '@/features/ownership/components/V1NameManagerRecord'
import type { ProtocolVersion } from '@/utils/types'

/**
 * The Manager row of an onchain-imported DNS name, and nothing at all for any
 * other name.
 *
 * Its v1 registry entry is a *manager*: delegated control that the DNS Owner —
 * the `_ens` TXT address {@link NameOwnerRow} shows as the owner — takes back
 * whenever it likes by re-running `proveAndClaim`. Both roles therefore get a
 * row of their own, here as on the Ownership page, rather than one row calling
 * the manager "Owner" (WEB-125).
 *
 * Self-gating so the route doesn't have to know: the sync-status check is
 * already keyed on this name, so this costs no extra lookup.
 */
export const DnsManagerRow = ({
  name,
  manager,
  protocolVersion,
}: {
  readonly name: string
  /** The v1 registry owner, as `resolveEnsOwner` reported it. */
  readonly manager: Address
  readonly protocolVersion: ProtocolVersion
}) => {
  const { address: connectedAddress } = useConnection()
  const { isDnsManaged } = useDnsSyncStatus({
    name,
    manager,
    protocolVersion,
    connectedAddress,
  })

  if (!isDnsManaged) return null

  return <V1NameManagerRecord asRow name={name} />
}
