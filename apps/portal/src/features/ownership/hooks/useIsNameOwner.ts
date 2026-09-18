import { useQuery } from '@tanstack/react-query'
import { isAddressEqual } from 'viem'
import { useConnection } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getV1NameStateQueryOptions } from '@/features/transfer/v1/getV1NameState'
import { getV1Holder } from '@/features/transfer/v1/rules'

type UseIsNameOwnerParams = {
  name: string
  enabled?: boolean
}

type UseIsNameOwnerReturn = {
  /** True when the connected wallet holds the name at either V1 level. */
  isOwner: boolean
  isLoading: boolean
}

/**
 * Whether the connected wallet owns `name`, asking the protocol that actually
 * holds it.
 *
 * `resolveEnsOwner` flattens V1 ownership to a single `owner`, which for an
 * unwrapped `.eth` 2LD is the *controller* (the registry manager) — not the
 * ERC-721 registrant who holds the token (see `getV1NameState`). Those can be
 * different wallets, so comparing against the flattened owner alone answers
 * "is the connected wallet the manager?", which is the wrong question wherever
 * the caller means "does this wallet belong to the name".
 *
 * Both count as owners here: the registrant holds the token, the controller
 * holds the records, and each is a party to the name rather than a stranger it
 * happens to point at. V2 and wrapped/registry-level V1 names have one owner,
 * and the V1 read is skipped entirely for V2.
 */
export function useIsNameOwner({
  name,
  enabled = true,
}: UseIsNameOwnerParams): UseIsNameOwnerReturn {
  const { address: connectedAddress } = useConnection()

  // Shared query key with `useCanEditRecords`, so this costs no extra read.
  const ownerQuery = useQuery({
    ...getEnsOwnerQueryOptions({ name }),
    enabled: enabled && !!name,
  })

  const isV1 = ownerQuery.data?.protocolVersion === 'ENSv1'

  const v1Query = useQuery({
    ...getV1NameStateQueryOptions({ name }),
    enabled: enabled && !!name && isV1,
  })

  // Null while the V1 read is in flight, and for a lapsed name whose registrar
  // `ownerOf` reverts — in both cases the flattened owner is all we have.
  const v1Holder = v1Query.data?.subject
    ? getV1Holder(v1Query.data.subject)
    : null

  const holders = [ownerQuery.data?.owner, v1Holder]

  const isOwner =
    !!connectedAddress &&
    holders.some(
      (holder) => !!holder && isAddressEqual(connectedAddress, holder),
    )

  const isLoading =
    (enabled && (ownerQuery.isLoading || (isV1 && v1Query.isLoading))) || false

  return { isOwner, isLoading }
}
