import type { Address } from 'viem'

type IsConnectedProfileOwnerParams = {
  readonly owner: Address | undefined
  readonly walletAddress: Address | undefined
  readonly accountAddress: Address | null | undefined
  readonly ownerAddress: Address | null | undefined
}

export const isConnectedProfileOwner = ({
  owner,
  walletAddress,
  accountAddress,
  ownerAddress,
}: IsConnectedProfileOwnerParams): boolean => {
  const normalizedOwner = owner?.toLowerCase()
  if (!normalizedOwner) return false

  return [walletAddress, accountAddress, ownerAddress]
    .filter((addr): addr is Address => !!addr)
    .some((addr) => addr.toLowerCase() === normalizedOwner)
}
