import {
  useAccount,
  useLogout,
  useModal,
  useWallet,
} from '@getpara/react-sdk-lite'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Bell,
  BrainCircuit,
  ChevronDown,
  Copy,
  LayoutDashboard,
  Unlink,
  User,
} from 'lucide-react'
import { type ComponentProps, useEffect, useRef, useState } from 'react'
import type { Address } from 'viem'
import ensLogo from '@/assets/icons/ens.svg'
import ensMobileLogo from '@/assets/icons/ens-mobile.svg'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { NotificationsDropdown } from '@/features/notifications/components'
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import {
  type SmartAccountState,
  useSmartAccountContext,
} from '@/lib/smart-account'

type ParaAccount = ReturnType<typeof useAccount>

const formatAddress = (address?: string | null) => {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const getHeaderDisplayName = ({
  account,
  isLoading,
  ownerAddress,
  reverseName,
}: {
  account: ParaAccount
  isLoading: boolean
  ownerAddress: string | null | undefined
  reverseName: string | null
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
          return formatAddress(embeddedAccount.externalWalletAddress)
        }
        break
    }
  }

  if (ownerAddress) {
    return formatAddress(ownerAddress)
  }

  return 'Connected'
}

const useStableReverseName = ({
  ownerAddress,
  reverseName,
  isReverseNameSuccess,
}: {
  ownerAddress: string | null | undefined
  reverseName: string | null | undefined
  isReverseNameSuccess: boolean
}) => {
  const lastOwnerAddressRef = useRef<string | null>(null)
  const [stableReverseName, setStableReverseName] = useState<string | null>(
    null,
  )

  useEffect(() => {
    const normalizedOwnerAddress = ownerAddress ?? null

    if (normalizedOwnerAddress !== lastOwnerAddressRef.current) {
      lastOwnerAddressRef.current = normalizedOwnerAddress
      setStableReverseName(reverseName ?? null)
      return
    }

    if (reverseName) {
      setStableReverseName(reverseName)
      return
    }

    if (isReverseNameSuccess) {
      setStableReverseName(null)
    }
  }, [ownerAddress, reverseName, isReverseNameSuccess])

  return stableReverseName
}

// Reusable menu content component
const UserMenuContent = ({
  account: _account,
  address: _address,
  accountAddress,
  ownerAddress,
  isLoading,
  stablecoinBalances,
  smartAccountEthBalance,
  isLoadingSmartAccountEth,
  smartAccountClient,
  error,
  copied,
  handleCopyAddress,
  displayName,
  ensAvatar,
  autoFundingMutation,
  walletSource,
}: {
  account: ReturnType<typeof useAccount>
  address: string | undefined
  accountAddress: string | null | undefined
  ownerAddress: string | null | undefined
  isLoading: boolean
  stablecoinBalances:
    | Array<{ address: string; symbol: string; formattedBalance?: string }>
    | undefined
  smartAccountEthBalance: { formattedBalance: string } | null | undefined
  isLoadingSmartAccountEth: boolean
  smartAccountClient: unknown
  error: string | null
  copied: boolean
  handleCopyAddress: (address: string) => void
  displayName: string
  ensAvatar: string | null | undefined
  autoFundingMutation: SmartAccountState['autoFundingMutation']
  walletSource: 'para-embedded' | 'external-wallet' | null
}) => {
  const isExternalWallet = walletSource === 'external-wallet'
  const isParaEmbedded = walletSource === 'para-embedded'
  return (
    <>
      <div className="p-4 md:p-4">
        {/* User Header with Avatar */}
        <div className="mb-6 flex items-center gap-3">
          {ensAvatar ? (
            <img
              alt="ENS Avatar"
              className="size-12 shrink-0 rounded-full border-2 border-ens-blue-light object-cover"
              src={ensAvatar}
            />
          ) : (
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-ens-blue-light bg-ens-lapis-dust">
              {isLoading ? (
                <div className="size-6 animate-spin rounded-full border-2 border-ens-blue border-t-transparent" />
              ) : (
                <User className="size-6 text-ens-blue" />
              )}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-ens-blue-dark text-lg">
                {displayName}
              </span>
              {isExternalWallet && ownerAddress && (
                <button
                  className="shrink-0 rounded p-1 text-ens-blue transition-colors hover:bg-ens-blue-light"
                  onClick={() => handleCopyAddress(ownerAddress)}
                  type="button"
                >
                  <Copy className="size-4" />
                </button>
              )}
            </div>
            {isParaEmbedded && ownerAddress && (
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="truncate font-mono text-ens-blue text-xs"
                  title={ownerAddress}
                >
                  {`${ownerAddress.slice(0, 6)}...${ownerAddress.slice(-4)}`}
                </span>
                <button
                  aria-label="Copy EOA address"
                  className="shrink-0 rounded p-1 text-ens-blue transition-colors hover:bg-ens-blue-light"
                  onClick={() => handleCopyAddress(ownerAddress)}
                  type="button"
                >
                  <Copy className="size-4" />
                </button>
              </div>
            )}
            {isLoading && (
              <div className="mt-0.5 text-ens-blue text-xs">
                Creating smart account...
              </div>
            )}
          </div>
        </div>

        {/* Smart Account Information */}
        {(isLoading || smartAccountClient || accountAddress) && (
          <div className="mb-4">
            <div className="mb-2 font-medium text-ens-blue-midnight text-xs uppercase tracking-wide">
              Smart Account Address
            </div>

            {isLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-ens-blue-light bg-ens-lapis-dust p-3">
                <div className="size-4 animate-spin rounded-full border-2 border-ens-blue border-t-transparent" />
                <span className="text-ens-blue-dark text-sm">
                  Creating smart account...
                </span>
              </div>
            ) : error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="font-medium text-red-600 text-sm">
                  Failed to create smart account
                </div>
                <div className="mt-1 text-red-500 text-xs">{error}</div>
              </div>
            ) : smartAccountClient && accountAddress ? (
              <div className="flex items-center justify-between rounded-lg border border-ens-blue-light bg-ens-lapis-dust p-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-ens-blue-dark text-sm">
                    {`${accountAddress.slice(0, 6)}...${accountAddress.slice(-4)}`}
                  </span>
                  <button
                    className="rounded p-1 text-ens-blue transition-colors hover:bg-ens-blue-light"
                    onClick={() => handleCopyAddress(accountAddress)}
                    type="button"
                  >
                    <Copy className="size-4" />
                  </button>
                </div>
                {smartAccountEthBalance && (
                  <span className="font-bold text-ens-blue-dark text-sm">
                    {smartAccountEthBalance.formattedBalance}
                  </span>
                )}
                {isLoadingSmartAccountEth && (
                  <span className="text-ens-blue-midnight text-sm">
                    Loading...
                  </span>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Token Balances (Stablecoins) */}
        {!isLoading && (
          <div className="mb-4">
            <div className="mb-2 font-medium text-ens-blue-midnight text-xs uppercase tracking-wide">
              Token Balances
            </div>

            <div className="space-y-2">
              {stablecoinBalances?.map((balance, index) => (
                <div
                  className="flex items-center justify-between rounded-lg border border-ens-blue-light bg-ens-lapis-dust p-3"
                  key={`${balance.address}-${index}`}
                >
                  <span className="font-medium text-ens-blue-dark text-sm">
                    {balance.symbol}
                  </span>
                  {balance.formattedBalance && (
                    <span className="font-bold text-ens-blue-dark text-sm">
                      {balance.formattedBalance}
                    </span>
                  )}
                </div>
              ))}
              {autoFundingMutation.isPending ? (
                <div className="flex items-center gap-2 rounded-lg border border-ens-blue-light bg-ens-lapis-dust p-3">
                  <div className="size-4 animate-spin rounded-full border-2 border-ens-blue border-t-transparent" />
                  <span className="text-ens-blue-dark text-sm">
                    Processing auto-funds...
                  </span>
                </div>
              ) : autoFundingMutation.isError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="font-medium text-red-600 text-sm">
                    Auto-funding failed
                  </div>
                  <div className="mt-1 text-red-500 text-xs">
                    {autoFundingMutation.error?.message ?? 'Unknown error'}
                  </div>
                </div>
              ) : null}
            </div>
            {/* Alpha release info */}
            <p className="mt-2 text-ens-gray text-xs leading-relaxed">
              💡 For this alpha release, accounts are automatically funded with
              test tokens.
            </p>
          </div>
        )}

        {copied && (
          <div className="mb-3 font-medium text-ens-green text-sm">
            ✓ Copied to clipboard
          </div>
        )}
      </div>

      {/* Menu Items - will be rendered separately for dropdown vs drawer */}
    </>
  )
}

const ConnectedContent = () => {
  const account = useAccount()
  const { openModal } = useModal()
  const { logout } = useLogout()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const {
    client: smartAccountClient,
    accountAddress,
    ownerAddress,
    walletSource,
    isLoading,
    stablecoinBalances,
    smartAccountEthBalance,
    isLoadingSmartAccountEth,
    error,
    autoFundingMutation,
    openSessionModal,
    isSessionClient,
  } = useSmartAccountContext()

  const { data: reverseName, isSuccess: isReverseNameSuccess } = useQuery({
    ...profileReverseNameQuery(ownerAddress as Address),
    enabled: !!ownerAddress,
  })
  const { data: reverseRecords } = useQuery({
    ...profileRecordsQuery(reverseName ?? ''),
    enabled: !!reverseName,
  })

  const avatarRecord = reverseRecords?.texts.find(
    (text) => text.key === 'avatar',
  )?.value

  const { data: parsedAvatar } = useQuery({
    ...parseAvatarQuery(avatarRecord),
    enabled: !!avatarRecord,
  })

  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopyAddress = async (addressToCopy: string) => {
    try {
      await navigator.clipboard.writeText(addressToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy address:', error)
    }
  }

  const stableReverseName = useStableReverseName({
    ownerAddress,
    reverseName,
    isReverseNameSuccess,
  })
  const displayName = getHeaderDisplayName({
    account,
    isLoading,
    ownerAddress,
    reverseName: stableReverseName,
  })

  // Shared trigger button
  const triggerButton = (
    <button
      className="flex min-w-0 max-w-full items-center gap-0.5 rounded-full border border-gray-300 py-1 pr-1.5 pl-1 transition-colors hover:bg-gray-50 md:gap-1 md:pr-2"
      type="button"
    >
      <div className="flex min-w-0 items-center gap-1 md:gap-2">
        {parsedAvatar ? (
          <img
            alt="ENS Avatar"
            className="size-[36px] shrink-0 rounded-full md:size-[46px]"
            src={parsedAvatar}
          />
        ) : (
          <div className="flex size-[36px] shrink-0 items-center justify-center rounded-full bg-muted md:size-[46px]">
            {isLoading ? (
              <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent md:size-5" />
            ) : (
              <User className="size-4 text-muted-foreground md:size-5" />
            )}
          </div>
        )}
        <span
          className="min-w-0 truncate font-medium text-gray-700 text-sm leading-tight tracking-tight md:text-base md:leading-[0.96] md:tracking-[-0.32px]"
          title={displayName}
        >
          {displayName}
          {isLoading && (
            <span className="ml-1 shrink-0 text-muted-foreground text-xs md:ml-2">
              (Smart Account)
            </span>
          )}
        </span>
      </div>
      <ChevronDown className="size-5 shrink-0 text-gray-500 md:size-6" />
    </button>
  )

  // Shared menu content props
  const menuContentProps: ComponentProps<typeof UserMenuContent> = {
    account,
    address: ownerAddress as Address,
    accountAddress,
    ownerAddress,
    walletSource,
    isLoading,
    stablecoinBalances,
    smartAccountEthBalance,
    isLoadingSmartAccountEth,
    smartAccountClient,
    error,
    copied,
    handleCopyAddress,
    displayName,
    ensAvatar: parsedAvatar,
    autoFundingMutation,
  }

  return (
    <div className="flex min-w-0 items-center gap-2 md:gap-4">
      {isDesktop ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-96">
            <UserMenuContent {...menuContentProps} />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-ens-blue-dark"
              onClick={() => openModal()}
            >
              <User className="mr-2 size-4 text-ens-blue" />
              Manage Wallet
            </DropdownMenuItem>
            {walletSource === 'external-wallet' && (
              <DropdownMenuItem
                className="text-ens-blue-dark"
                disabled={isSessionClient}
                onClick={() => openSessionModal()}
              >
                <BrainCircuit className="mr-2 size-4 text-ens-blue" />
                {isSessionClient
                  ? 'Smart Session Active'
                  : 'Enable Smart Session'}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-ens-blue-dark"
              onClick={() => logout()}
            >
              <Unlink className="mr-2 size-4 text-ens-blue" />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Drawer onOpenChange={setMenuOpen} open={menuOpen}>
          <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
          <DrawerContent>
            <div className="max-h-[80vh] overflow-y-auto">
              <UserMenuContent {...menuContentProps} />
              <div className="border-ens-blue-light border-t">
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-ens-blue-dark text-sm transition-colors hover:bg-ens-lapis-dust"
                  onClick={() => {
                    openModal()
                    setMenuOpen(false)
                  }}
                  type="button"
                >
                  <User className="size-4 text-ens-blue" />
                  Manage Wallet
                </button>
                {walletSource === 'external-wallet' && (
                  <button
                    className="flex w-full items-center gap-3 px-4 py-3 text-ens-blue-dark text-sm transition-colors hover:bg-ens-lapis-dust disabled:opacity-50"
                    disabled={isSessionClient}
                    onClick={() => {
                      openSessionModal()
                      setMenuOpen(false)
                    }}
                    type="button"
                  >
                    <BrainCircuit className="size-4 text-ens-blue" />
                    {isSessionClient
                      ? 'Smart Session Active'
                      : 'Enable Smart Session'}
                  </button>
                )}
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-ens-blue-dark text-sm transition-colors hover:bg-ens-lapis-dust"
                  onClick={() => {
                    logout()
                    setMenuOpen(false)
                  }}
                  type="button"
                >
                  <Unlink className="size-4 text-ens-blue" />
                  Disconnect
                </button>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      )}

      <Popover onOpenChange={setNotificationsOpen} open={notificationsOpen}>
        <PopoverTrigger asChild>
          <button
            className="flex items-center justify-center rounded-full border border-gray-300 p-2 transition-colors hover:bg-gray-50 md:p-[11px]"
            type="button"
          >
            <Bell className="size-5 md:size-6" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-sm" collisionPadding={16} sideOffset={16}>
          <NotificationsDropdown onAction={() => setNotificationsOpen(false)} />
        </PopoverContent>
      </Popover>

      <Link
        className="flex items-center justify-center rounded-full border border-gray-300 p-2 transition-colors hover:bg-gray-50 md:p-[11px]"
        to="/dashboard"
      >
        <LayoutDashboard className="size-5 md:size-6" />
      </Link>
    </div>
  )
}

const DisconnectedContent = () => {
  const { openModal } = useModal()
  const { isLoading: walletLoading } = useWallet()

  const handleConnect = async () => {
    try {
      await openModal()
    } catch (error) {
      console.error('Failed to open Para modal:', error)
    }
  }

  return (
    <div className="mr-6 flex items-center gap-4">
      <Button
        disabled={walletLoading}
        onClick={handleConnect}
        size="lg"
        variant="connectWallet"
      >
        {walletLoading ? 'Loading...' : 'Connect'}
      </Button>
    </div>
  )
}

export const Header = () => {
  const { data: wallet, isLoading: walletLoading } = useWallet()
  const isConnected = !!wallet && !walletLoading

  return (
    <nav className="sticky top-0 z-10 flex min-w-0 items-center justify-between gap-4 bg-background px-4 py-4 md:px-10 md:py-7">
      <div className="flex shrink-0 flex-col md:flex-row md:items-center md:gap-3">
        <div className="flex items-center gap-3">
          <Link className="shrink-0 py-2" to="/">
            <img
              alt="ENS Logo"
              className="h-8 shrink-0 md:hidden"
              src={ensMobileLogo}
            />
            <img
              alt="ENS Logo"
              className="hidden h-8 shrink-0 md:block"
              src={ensLogo}
            />
          </Link>
          {/* Sepolia Chain Badge */}
          <span className="rounded-full border border-ens-blue-light bg-ens-lapis-dust px-2.5 py-1 font-medium font-mono text-ens-blue-dark text-xs uppercase tracking-wide">
            Sepolia
          </span>
        </div>
        {/* Chrome recommendation badge */}
        <span className="hidden w-fit rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-700 text-xs md:inline-flex">
          Works best on Chrome
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-2 md:gap-4">
        {walletLoading ? (
          <div className="flex items-center gap-4">
            <div className="h-8 w-28 animate-pulse rounded bg-gray-200" />
          </div>
        ) : isConnected ? (
          <ConnectedContent />
        ) : (
          <DisconnectedContent />
        )}
      </div>
    </nav>
  )
}
