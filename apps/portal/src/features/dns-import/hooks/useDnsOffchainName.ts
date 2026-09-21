import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import type { GetEnsOwnerReturnType } from '@/features/profile/hooks/useEnsOwner'
import { isClaimable } from '@/utils/ens/tldHelpers'
import { getDnsOffchainStatusQueryOptions } from '../queries/getDnsOffchainStatus'

type UseDnsOffchainNameParameters = {
  readonly name: string
  /**
   * The name's registry owner: undefined while that lookup is in flight (or
   * failed), null once it came back empty. Only an ownerless name is checked.
   */
  readonly owner: GetEnsOwnerReturnType | undefined
}

type UseDnsOffchainNameReturnType = {
  readonly isLoading: boolean
  /** Where the name resolves through its `ENS1` record; null when it doesn't. */
  readonly resolvedAddress: Address | null
}

/**
 * Whether a DNS 2LD is live off-chain through its `ENS1` TXT record.
 *
 * A gasless name has no registry entry by design, so the owner lookup returns
 * null for a name that resolves fine — a null owner is not a verdict on a DNS
 * name. Pages that gate on the owner use this to tell a live gasless name
 * apart from one that was never imported.
 *
 * Lookup errors are the expected "no ENS1 record" case (the underlying read is
 * strict), so they read as "not live" rather than as a failure.
 */
export const useDnsOffchainName = ({
  name,
  owner,
}: UseDnsOffchainNameParameters): UseDnsOffchainNameReturnType => {
  const { data, isLoading } = useQuery({
    ...getDnsOffchainStatusQueryOptions({ name }),
    enabled: owner === null && isClaimable(name),
  })

  return { isLoading, resolvedAddress: data?.resolvedAddress ?? null }
}
