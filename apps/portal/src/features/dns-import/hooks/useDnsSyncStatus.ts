import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query'
import { type Address, isAddressEqual } from 'viem'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
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
  const queryClient = useQueryClient()

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

  // The status compares two sides, so a refresh has to re-read both: the
  // manager is just as likely to be the side that moved (someone re-ran
  // `proveAndClaim`), and that leaves the TXT record untouched — refetching
  // DNS alone would re-compare against a stale cached manager and keep the
  // warning up.
  const managerQueryKey = getEnsOwnerQueryOptions({ name }).queryKey
  const isManagerRefetching = useIsFetching({ queryKey: managerQueryKey }) > 0

  const refresh = () => {
    void Promise.all([
      dnsOwnerQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: managerQueryKey }),
    ])
  }

  return {
    status,
    dnsOwner,
    refresh,
    isRefreshing: dnsOwnerQuery.isRefetching || isManagerRefetching,
  }
}
