import { useQuery } from '@tanstack/react-query'
import { isAddressEqual } from 'viem'
import { useConnection } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getV1NameStateQueryOptions } from '@/features/transfer/v1/getV1NameState'
import { getV1Holder } from '@/features/transfer/v1/rules'

type UseIsNameOwnerParams = {
  readonly name: string
}

type UseIsNameOwnerReturn = {
  readonly isOwner: boolean
  readonly isLoading: boolean
}

/**
 * Whether the connected wallet owns `name`.
 *
 * `resolveEnsOwner` flattens V1 ownership to a single `owner`, which for an
 * unwrapped `.eth` 2LD is the *controller*, not the ERC-721 registrant holding
 * the token (see `getV1NameState`). Both count as owners — each is a party to
 * the name rather than a stranger it happens to point at — so V1 needs the
 * second read, and V2 doesn't.
 */
export function useIsNameOwner({
  name,
}: UseIsNameOwnerParams): UseIsNameOwnerReturn {
  const { address: connectedAddress } = useConnection()

  // Same query key as `useCanEditRecords`, so this costs no extra read.
  const ownerQuery = useQuery({
    ...getEnsOwnerQueryOptions({ name }),
    enabled: !!name,
  })
  const isV1 = ownerQuery.data?.protocolVersion === 'ENSv1'
  const v1Query = useQuery({
    ...getV1NameStateQueryOptions({ name }),
    enabled: !!name && isV1,
  })

  // Gated on `isV1`, not just on the query: a disabled query stops fetching but
  // keeps its cache, so a name once read as V1 would still report that old
  // holder after resolving as V2. Null too for a lapsed name, whose registrar
  // `ownerOf` reverts.
  const v1Holder =
    isV1 && v1Query.data?.subject ? getV1Holder(v1Query.data.subject) : null

  const isOwner = [ownerQuery.data?.owner, v1Holder].some(
    (holder) =>
      !!connectedAddress &&
      !!holder &&
      isAddressEqual(connectedAddress, holder),
  )

  return {
    isOwner,
    isLoading: ownerQuery.isLoading || (isV1 && v1Query.isLoading),
  }
}
