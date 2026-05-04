import type { useAccount } from '@getpara/react-sdk-lite'
import { truncateAddress } from '@/lib/utils'

export const getHeaderDisplayName = ({
  account,
  isLoading,
  ownerAddress,
  reverseName,
}: {
  readonly account: ReturnType<typeof useAccount>
  readonly isLoading: boolean
  readonly ownerAddress: string | null | undefined
  readonly reverseName: string | null
}) => {
  if (isLoading) {
    return 'Initializing...'
  }

  if (reverseName) {
    return reverseName
  }

  const embeddedAccount = account?.embedded

  if (embeddedAccount?.isConnected && embeddedAccount.authType) {
    switch (embeddedAccount.authType) {
      case 'email':
        if (embeddedAccount.email) return embeddedAccount.email
        break
      case 'phone':
        if (embeddedAccount.phone) return embeddedAccount.phone
        break
      case 'farcaster':
        if (embeddedAccount.farcasterUsername) {
          return `@${embeddedAccount.farcasterUsername}`
        }
        break
      case 'telegram':
        if (embeddedAccount.telegramUserId) {
          return `${embeddedAccount.telegramUserId}`
        }
        break
      case 'externalWallet':
        if (embeddedAccount.externalWalletAddress) {
          return truncateAddress(embeddedAccount.externalWalletAddress)
        }
        break
    }
  }

  if (ownerAddress) {
    return truncateAddress(ownerAddress)
  }

  return 'Connected'
}
