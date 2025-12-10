import type { Address } from 'viem'

type ProfileOwnerParams = {
  owner?: Address | null
  walletAddress?: Address | null
  smartAccountAddress?: Address | null
}

export const isProfileOwner = ({
  owner,
  walletAddress,
  smartAccountAddress,
}: ProfileOwnerParams) => {
  const normalizedOwner = owner?.toLowerCase()
  const normalizedSmartAccount = smartAccountAddress?.toLowerCase()
  const normalizedWalletAddress = walletAddress?.toLowerCase()

  const isOwnedBySmartAccount =
    Boolean(normalizedOwner && normalizedSmartAccount) &&
    normalizedOwner === normalizedSmartAccount

  const isOwnedByEoa =
    Boolean(normalizedOwner && normalizedWalletAddress) &&
    normalizedOwner === normalizedWalletAddress

  return {
    isOwnedBySmartAccount,
    isOwnedByEoa,
  }
}
