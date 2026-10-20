import { useQueries } from '@tanstack/react-query'
import { type Address, isAddressEqual } from 'viem'
import { useAccount } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'

export const ownsAllNames = (
  address: Address | undefined,
  owners: readonly (Address | null | undefined)[],
): boolean =>
  address !== undefined &&
  owners.length > 0 &&
  owners.every((owner) => !!owner && isAddressEqual(address, owner))

/** True once every name is known to be owned by the connected wallet; false while any owner is unknown. */
export const useOwnsAllNames = (names: readonly string[]): boolean => {
  const { address } = useAccount()

  return useQueries({
    queries: names.map((name) => getEnsOwnerQueryOptions({ name })),
    combine: (results) =>
      ownsAllNames(
        address,
        results.map((result) => result.data?.owner),
      ),
  })
}
