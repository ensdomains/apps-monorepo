import {
  useAccount as useParaAccount,
  useWallet as useParaWallet,
} from '@getpara/react-sdk-lite'
import { ChevronDownIcon, Loader2Icon, UserIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { match, P } from 'ts-pattern'
import paraIcon from '@/assets/icons/para-color.svg'
import { useConnectedAvatar } from '@/features/wallet/hooks/useConnectedAvatar'
import { useConnectedReverseName } from '@/features/wallet/hooks/useConnectedReverseName'
import { useDirectMetaMask } from '@/lib/DirectMetaMaskContext'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { truncateAddress } from '@/lib/utils'

const getHeaderDisplayName = ({
  account,
  isLoading,
  directMetaMaskAddress,
  ownerAddress,
  reverseName,
  walletAddress,
}: {
  account: ReturnType<typeof useParaAccount>
  directMetaMaskAddress: string | null | undefined
  isLoading: boolean
  ownerAddress: string | null | undefined
  reverseName: string | null
  walletAddress: string | null | undefined
}) => {
  if (isLoading) {
    return 'Initializing...'
  }

  if (reverseName) {
    return reverseName
  }

  // For external wallets (e.g. MetaMask via connectionOnly mode), account.embedded
  // is null — there is no Para embedded wallet. Use the Para wallet address directly.
  if (account?.connectionType === 'external' && walletAddress) {
    return truncateAddress(walletAddress)
  }

  if (directMetaMaskAddress) {
    return truncateAddress(directMetaMaskAddress)
  }

  const embeddedAccount = account?.embedded

  if (embeddedAccount?.isConnected && embeddedAccount.authType) {
    switch (embeddedAccount.authType) {
      case 'email':
        if (embeddedAccount.email) {
          return embeddedAccount.email
        }
        break
      case 'phone':
        if (embeddedAccount.phone) {
          return embeddedAccount.phone
        }
        break
      case 'farcaster':
        if (embeddedAccount.farcasterUsername) {
          return `@${embeddedAccount.farcasterUsername}`
        }
        break
      case 'telegram':
        if (embeddedAccount.telegramUserId) {
          return `Telegram: ${embeddedAccount.telegramUserId}`
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

export const ProfileTriggerButton = (
  props: ButtonHTMLAttributes<HTMLButtonElement>,
) => {
  const { ownerAddress, walletSource } = useSmartAccountContext()
  const reverseNameQuery = useConnectedReverseName()
  const avatar = useConnectedAvatar()
  const paraAccount = useParaAccount()
  const { data: paraWallet } = useParaWallet()
  const directMetaMask = useDirectMetaMask()

  return (
    <button
      {...props}
      className="flex min-w-0 max-w-full items-center gap-0.5 rounded-md border border-none py-1 pr-1.5 pl-1 transition-colors hover:bg-[#F7F7F7] md:gap-1 md:pr-2"
      type="button"
    >
      <div className="flex min-w-0 items-center gap-2 md:gap-2">
        <div className="flex size-[36px] shrink-0 items-center justify-center md:size-[46px]">
          {match({
            avatar: avatar.url,
            avatarLoading: avatar.isLoading,
            connectionType: paraAccount.connectionType,
            walletSource,
          })
            .with({ avatar: P.string }, ({ avatar }) => (
              <img
                alt="ENS Avatar"
                className="size-full rounded-full object-cover"
                src={avatar}
              />
            ))
            .with({ avatarLoading: true }, () => (
              <Loader2Icon className="size-4 animate-spin rounded-full bg-ens-gray-two md:size-5" />
            ))
            .with(
              {
                walletSource: 'external-wallet',
              },
              () => (
                <UserIcon className="size-4 text-muted-foreground md:size-5" />
              ),
            )
            .with({ walletSource: null, connectionType: P.any }, () =>
              directMetaMask.isConnected ? (
                <UserIcon className="size-4 text-muted-foreground md:size-5" />
              ) : null,
            )
            .with({ connectionType: P.union('embedded', 'both') }, () => (
              <img
                alt="Para Icon"
                className="size-full rounded-md bg-[#FEF9F8] object-cover p-2 md:p-2.5"
                src={paraIcon}
              />
            ))
            .otherwise(() => null)}
        </div>

        <span className="min-w-0 truncate font-normal text-gray-700 text-xs leading-tight tracking-tight md:text-lg md:leading-[0.96] md:tracking-[-0.32px]">
          {getHeaderDisplayName({
            account: paraAccount,
            directMetaMaskAddress: directMetaMask.address,
            isLoading: paraAccount.isLoading,
            ownerAddress,
            reverseName: reverseNameQuery.data ?? null,
            walletAddress: paraWallet?.address,
          })}
        </span>
      </div>
      <ChevronDownIcon className="size-5 shrink-0 text-gray-500 md:size-6" />
    </button>
  )
}
