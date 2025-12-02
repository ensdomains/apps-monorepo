import { useAccount, useModal, useWallet } from '@getpara/react-sdk-lite'
import { Link } from '@tanstack/react-router'
import {
  Bell,
  ChevronDown,
  Copy,
  CreditCard,
  LayoutGrid,
  RefreshCcw,
  Unlink,
  User,
} from 'lucide-react'
import { useState } from 'react'
import ensLogo from '@/assets/icons/ens.svg'
import ensMobileLogo from '@/assets/icons/ens-mobile.svg'
import { Button } from '@/components/ui/button'
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
import { useTheme } from '@/hooks/use-theme'
import { useRhinestoneAccount } from '@/lib/rhinestone/useRhinestoneAccount'

const ConnectedContent = () => {
  const { data: wallet } = useWallet()
  const account = useAccount()
  const { openModal } = useModal()
  const {
    rhinestoneAccount,
    accountAddress,
    isLoading,
    stablecoinBalances,
    eoaEthBalance,
    smartAccountEthBalance,
    isLoadingEoaEth,
    isLoadingSmartAccountEth,
    error,
  } = useRhinestoneAccount()

  const address = wallet?.address
  const ensName = wallet?.ensName
  const ensAvatar = wallet?.ensAvatar

  const [notificationsOpen, setNotificationsOpen] = useState(false)
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

  const getDisplayName = () => {
    // Show loading state while Rhinestone account is being created
    if (isLoading) {
      return 'Initializing...'
    }

    // Check embedded account with auth type
    if (account?.embedded?.isConnected && account.embedded.authType) {
      const authType = account.embedded.authType

      switch (authType) {
        case 'email':
          if (account.embedded.email) {
            return account.embedded.email
          }
          break
        case 'phone':
          if (account.embedded.phone) {
            return account.embedded.phone
          }
          break
        case 'farcaster':
          if (account.embedded.farcasterUsername) {
            return `@${account.embedded.farcasterUsername}`
          }
          break
        case 'telegram':
          if (account.embedded.telegramUserId) {
            return `Telegram: ${account.embedded.telegramUserId}`
          }
          break
        case 'externalWallet':
          if (account.embedded.externalWalletAddress) {
            const addr = account.embedded.externalWalletAddress
            return `${addr.slice(0, 6)}...${addr.slice(-4)}`
          }
          break
      }
    }

    // Fallback to ENS name or wallet address
    if (ensName) {
      return ensName
    }

    if (address) {
      return `${address.slice(0, 6)}...${address.slice(-4)}`
    }
    return 'Connected'
  }

  return (
    <div className="mr-2 flex items-center gap-2 md:mr-6 md:gap-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-0.5 rounded-full border border-gray-300 py-1 pr-1.5 pl-1 transition-colors hover:bg-gray-50 md:gap-1 md:pr-2"
          >
            <div className="flex items-center gap-1 md:gap-2">
              {ensAvatar ? (
                <img
                  src={ensAvatar}
                  alt="ENS Avatar"
                  className="size-[36px] rounded-full md:size-[46px]"
                />
              ) : (
                <div className="flex size-[36px] items-center justify-center rounded-full bg-muted md:size-[46px]">
                  {isLoading ? (
                    <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent md:size-5" />
                  ) : (
                    <User className="size-4 text-muted-foreground md:size-5" />
                  )}
                </div>
              )}
              <span className="font-medium text-gray-700 text-sm leading-tight tracking-tight md:text-base md:leading-[0.96] md:tracking-[-0.32px]">
                {getDisplayName()}
                {isLoading && (
                  <span className="ml-1 text-muted-foreground text-xs md:ml-2">
                    (Smart Account)
                  </span>
                )}
              </span>
            </div>
            <ChevronDown className="size-5 text-gray-500 md:size-6" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <div className="p-4">
            <div className="mb-4">
              <div className="font-medium text-base text-ens-blue-dark">
                {getDisplayName()}
              </div>
            </div>

            {/* EOA Address and Balance - Only show if NOT using smart account auth */}
            {address && !account?.embedded?.isConnected && (
              <div className="mb-3">
                <div className="mb-2 font-medium text-gray-500 text-xs uppercase tracking-wide">
                  EOA Address
                </div>

                <div className="flex items-center justify-between rounded-lg bg-gray-100 p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-gray-600 text-sm">
                      {`${address.slice(0, 6)}...${address.slice(-4)}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyAddress(address)}
                      className="rounded p-1 transition-colors hover:bg-white"
                    >
                      <Copy className="size-4 text-gray-600" />
                    </button>
                  </div>
                  {eoaEthBalance && (
                    <span className="font-bold text-ens-blue-dark text-sm">
                      {eoaEthBalance.formattedBalance}
                    </span>
                  )}
                  {isLoadingEoaEth && (
                    <span className="text-gray-500 text-sm">Loading...</span>
                  )}
                </div>
              </div>
            )}

            {/* Rhinestone Smart Account Information */}
            {(isLoading || rhinestoneAccount || accountAddress) && (
              <div className="mb-3">
                <div className="mb-2 font-medium text-gray-500 text-xs uppercase tracking-wide">
                  Smart Account Address
                </div>

                {isLoading ? (
                  <div className="flex items-center gap-2 rounded-lg bg-gray-100 p-3">
                    <div className="size-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
                    <span className="text-gray-600 text-sm">
                      Creating smart account...
                    </span>
                  </div>
                ) : error ? (
                  <div className="rounded-lg bg-red-50 p-3">
                    <div className="font-medium text-red-600 text-sm">
                      Failed to create smart account
                    </div>
                    <div className="mt-1 text-red-500 text-xs">{error}</div>
                  </div>
                ) : rhinestoneAccount && accountAddress ? (
                  <div className="flex items-center justify-between rounded-lg bg-gray-100 p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-gray-600 text-sm">
                        {`${accountAddress.slice(0, 6)}...${accountAddress.slice(-4)}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyAddress(accountAddress)}
                        className="rounded p-1 transition-colors hover:bg-white"
                      >
                        <Copy className="size-4 text-gray-600" />
                      </button>
                    </div>
                    {smartAccountEthBalance && (
                      <span className="font-bold text-ens-blue-dark text-sm">
                        {smartAccountEthBalance.formattedBalance}
                      </span>
                    )}
                    {isLoadingSmartAccountEth && (
                      <span className="text-gray-500 text-sm">Loading...</span>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* Token Balances (Stablecoins) */}
            {!isLoading &&
              stablecoinBalances &&
              stablecoinBalances.length > 0 && (
                <div className="mb-3">
                  <div className="mb-2 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Token Balances
                  </div>
                  <div className="space-y-2">
                    {stablecoinBalances.map((balance, index) => (
                      <div
                        key={`${balance.address}-${index}`}
                        className="flex items-center justify-between rounded-lg bg-gray-100 p-3"
                      >
                        <span className="font-medium text-gray-600 text-sm">
                          {balance.symbol}
                        </span>
                        {balance.formattedBalance && (
                          <span className="font-bold text-ens-blue-dark text-sm">
                            {balance.formattedBalance}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {copied && (
              <div className="mb-3 font-medium text-green-600 text-sm">
                ✓ Copied to clipboard
              </div>
            )}
          </div>

          <DropdownMenuSeparator />

          {/* Menu Items */}
          <DropdownMenuItem asChild>
            <Link to="/auto-renewal">
              <RefreshCcw className="mr-2 size-4" />
              Renewals
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link to="/payment/list">
              <CreditCard className="mr-2 size-4" />
              Payment Methods
            </Link>
          </DropdownMenuItem>

          {/* TODO: Add /transactions route */}
          {/* <DropdownMenuItem asChild>
            <Link to="/transactions">
              <List className="mr-2 size-4" />
              All Transactions
            </Link>
          </DropdownMenuItem> */}

          <DropdownMenuSeparator />

          {/* Manage Wallet */}
          <DropdownMenuItem onClick={() => openModal()}>
            <User className="mr-2 size-4" />
            Manage Wallet
          </DropdownMenuItem>

          {/* Disconnect */}
          <DropdownMenuItem onClick={() => openModal()}>
            <Unlink className="mr-2 size-4" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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

const Menu = () => {
  const { theme, toggleTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-center rounded-full border border-gray-300 p-2 transition-colors hover:bg-gray-50 md:p-[11px]"
        >
          <LayoutGrid className="size-5 md:size-6" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent collisionPadding={16}>
        <DropdownMenuItem onClick={toggleTheme}>
          {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const Header = () => {
  const { data: wallet, isLoading: walletLoading } = useWallet()
  const isConnected = !!wallet && !walletLoading

  return (
    <nav className="sticky top-0 z-10 flex items-center justify-end bg-background px-10 py-7">
      <Link to="/" className="mr-auto py-2">
        <img src={ensMobileLogo} alt="ENS Logo" className="h-8 md:hidden" />
        <img src={ensLogo} alt="ENS Logo" className="hidden h-8 md:block" />
      </Link>
      {!walletLoading ? (
        isConnected ? (
          <ConnectedContent />
        ) : (
          <DisconnectedContent />
        )
      ) : (
        <div className="mr-6 flex items-center gap-4">
          <div className="h-8 w-28 animate-pulse rounded bg-gray-200" />
        </div>
      )}
      <Menu />
    </nav>
  )
}
