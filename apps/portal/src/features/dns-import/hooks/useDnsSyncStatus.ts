import { useQuery } from '@tanstack/react-query'
import { type Address, isAddressEqual } from 'viem'
import { isClaimable } from '@/utils/ens/tldHelpers'
import { getDnsOwnerQueryOptions } from '../queries/getDnsOwner'

/**
 * Sync state between a DNS name's `_ens` TXT record and its v1 registry
 * manager (WEB-125/WEB-465):
 * - `not-applicable` — not an onchain-imported DNS 2LD, or the record is
 *   unreadable (nothing to act on).
 * - `in-sync` — the TXT address is the manager.
 * - `syncable` — the connected wallet IS the TXT address but not the manager:
 *   it can run Sync Manager (`proveAndClaim`) to take over.
 * - `out-of-sync` — the TXT address differs from the manager and the viewer
 *   can't fix it; shown as a trust warning.
 */
export type DnsSyncStatus =
  | 'not-applicable'
  | 'in-sync'
  | 'syncable'
  | 'out-of-sync'

type UseDnsSyncStatusParams = {
  readonly name: string
  /** The v1 registry owner (the "manager" of an imported DNS name). */
  readonly manager: Address | undefined
  readonly protocolVersion: string | undefined
  readonly connectedAddress: Address | undefined
}

export const useDnsSyncStatus = ({
  name,
  manager,
  protocolVersion,
  connectedAddress,
}: UseDnsSyncStatusParams) => {
  // DNS import writes to the v1 registry, so only v1-owned DNS 2LDs can be
  // out of sync. (v2 has no DNS registrar yet.)
  const isApplicable =
    isClaimable(name) && protocolVersion === 'ENSv1' && !!manager

  // Non-strict: any lookup failure returns null — for detection, an unreadable
  // record simply means there is nothing to compare against.
  const dnsOwnerQuery = useQuery({
    ...getDnsOwnerQueryOptions({ name, strict: false }),
    enabled: isApplicable,
    staleTime: 1000 * 60 * 5,
  })

  const dnsOwner = dnsOwnerQuery.data ?? null

  const status: DnsSyncStatus = (() => {
    if (!isApplicable || !manager || !dnsOwner) return 'not-applicable'
    if (isAddressEqual(dnsOwner, manager)) return 'in-sync'
    if (connectedAddress && isAddressEqual(dnsOwner, connectedAddress)) {
      return 'syncable'
    }
    return 'out-of-sync'
  })()

  return {
    status,
    dnsOwner,
    refetch: () => void dnsOwnerQuery.refetch(),
    isRefetching: dnsOwnerQuery.isRefetching,
  }
}
