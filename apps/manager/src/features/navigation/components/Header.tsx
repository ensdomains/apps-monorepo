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
import { match, P } from 'ts-pattern'
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
import { parseAvatarQuery } from '@/features/profile/service/useProfileAvatar'
import { useProfileRecordsQuery } from '@/features/profile/service/useProfileRecords'
import { useProfileReverseNameQuery } from '@/features/profile/service/useProfileReverseName'
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
    const embeddedDisplayName = match(embeddedAccount)
      .with({ authType: 'email', email: P.string }, ({ email }) => email)
      .with({ authType: 'phone', phone: P.string }, ({ phone }) => phone)
      .with(
        { authType: 'farcaster', farcasterUsername: P.string },
        ({ farcasterUsername }) => `@${farcasterUsername}`,
      )
      .with(
        { authType: 'telegram', telegramUserId: P.string },
        ({ telegramUserId }) => `Telegram: ${telegramUserId}`,
      )
      .with(
        { authType: 'externalWallet', externalWalletAddress: P.string },
        ({ externalWalletAddress }) => formatAddress(externalWalletAddress),
      )
      .otherwise(() => null)

    if (embeddedDisplayName) {
      return embeddedDisplayName
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
              src={ensAvatar}
              alt="ENS Avatar"
              className="size-12 shrink-0 rounded-full border-2 border-ens-blue-light object-cover"
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
                  type="button"
                  onClick={() => handleCopyAddress(ownerAddress)}
                  className="shrink-0 rounded p-1 text-ens-blue transition-colors hover:bg-ens-blue-light"
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
                  type="button"
                  onClick={() => handleCopyAddress(ownerAddress)}
                  className="shrink-0 rounded p-1 text-ens-blue transition-colors hover:bg-ens-blue-light"
                  aria-label="Copy EOA address"
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
                    type="button"
                    onClick={() => handleCopyAddress(accountAddress)}
                    className="rounded p-1 text-ens-blue transition-colors hover:bg-ens-blue-light"
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
                  key={`${balance.address}-${index}`}
                  className="flex items-center justify-between rounded-lg border border-ens-blue-light bg-ens-lapis-dust p-3"
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
    ...useProfileReverseNameQuery(ownerAddress as Address),
    enabled: !!ownerAddress,
  })
  const { data: reverseRecords } = useQuery({
    ...useProfileRecordsQuery(reverseName ?? ''),
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
      type="button"
      className="flex min-w-0 max-w-full items-center gap-0.5 rounded-full border border-gray-300 py-1 pr-1.5 pl-1 transition-colors hover:bg-gray-50 md:gap-1 md:pr-2"
    >
      <div className="flex min-w-0 items-center gap-1 md:gap-2">
        {parsedAvatar ? (
          <img
            src={parsedAvatar}
            alt="ENS Avatar"
            className="size-[36px] shrink-0 rounded-full md:size-[46px]"
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
              onClick={() => openModal()}
              className="text-ens-blue-dark"
            >
              <User className="mr-2 size-4 text-ens-blue" />
              Manage Wallet
            </DropdownMenuItem>
            {walletSource === 'external-wallet' && (
              <DropdownMenuItem
                onClick={() => openSessionModal()}
                className="text-ens-blue-dark"
                disabled={isSessionClient}
              >
                <BrainCircuit className="mr-2 size-4 text-ens-blue" />
                {isSessionClient
                  ? 'Smart Session Active'
                  : 'Enable Smart Session'}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => logout()}
              className="text-ens-blue-dark"
            >
              <Unlink className="mr-2 size-4 text-ens-blue" />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
          <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
          <DrawerContent>
            <div className="max-h-[80vh] overflow-y-auto">
              <UserMenuContent {...menuContentProps} />
              <div className="border-ens-blue-light border-t">
                <button
                  type="button"
                  onClick={() => {
                    openModal()
                    setMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-ens-blue-dark text-sm transition-colors hover:bg-ens-lapis-dust"
                >
                  <User className="size-4 text-ens-blue" />
                  Manage Wallet
                </button>
                {walletSource === 'external-wallet' && (
                  <button
                    type="button"
                    onClick={() => {
                      openSessionModal()
                      setMenuOpen(false)
                    }}
                    disabled={isSessionClient}
                    className="flex w-full items-center gap-3 px-4 py-3 text-ens-blue-dark text-sm transition-colors hover:bg-ens-lapis-dust disabled:opacity-50"
                  >
                    <BrainCircuit className="size-4 text-ens-blue" />
                    {isSessionClient
                      ? 'Smart Session Active'
                      : 'Enable Smart Session'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    logout()
                    setMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-ens-blue-dark text-sm transition-colors hover:bg-ens-lapis-dust"
                >
                  <Unlink className="size-4 text-ens-blue" />
                  Disconnect
                </button>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      )}

      <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center justify-center rounded-full border border-gray-300 p-2 transition-colors hover:bg-gray-50 md:p-[11px]"
          >
            <Bell className="size-5 md:size-6" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-sm" collisionPadding={16} sideOffset={16}>
          <NotificationsDropdown onAction={() => setNotificationsOpen(false)} />
        </PopoverContent>
      </Popover>

      <Link
        to="/dashboard"
        className="flex items-center justify-center rounded-full border border-gray-300 p-2 transition-colors hover:bg-gray-50 md:p-[11px]"
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
        variant="connectWallet"
        onClick={handleConnect}
        disabled={walletLoading}
        size="lg"
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
          <Link to="/" className="shrink-0 py-2">
            <img
              src={ensMobileLogo}
              alt="ENS Logo"
              className="h-8 shrink-0 md:hidden"
            />
            <img
              src={ensLogo}
              alt="ENS Logo"
              className="hidden h-8 shrink-0 md:block"
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
        {!walletLoading ? (
          isConnected ? (
            <ConnectedContent />
          ) : (
            <DisconnectedContent />
          )
        ) : (
          <div className="flex items-center gap-4">
            <div className="h-8 w-28 animate-pulse rounded bg-gray-200" />
          </div>
        )}
      </div>
    </nav>
  )
}
