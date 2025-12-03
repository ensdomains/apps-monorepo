import {
  useAccount,
  useLogout,
  useModal,
  useWallet,
} from '@getpara/react-sdk-lite'
import { Link } from '@tanstack/react-router'
import {
  Bell,
  ChevronDown,
  Copy,
  CreditCard,
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
import { useRhinestoneAccount } from '@/lib/rhinestone/useRhinestoneAccount'

const ConnectedContent = () => {
  const { data: wallet } = useWallet()
  const account = useAccount()
  const { openModal } = useModal()
  const { logout } = useLogout()
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
    <div className="mr-0 flex items-center gap-[16px] md:mr-0 md:gap-[74px]">
      <div className="flex items-center gap-[16px]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-[4px] rounded-[100px] border-[#e6e6e6] border-[0.4px] bg-white py-[4px] pr-[8px] pl-[4px] transition-colors hover:bg-gray-50"
            >
              <div className="flex items-center gap-[8px]">
                {ensAvatar ? (
                  <img
                    src={ensAvatar}
                    alt="ENS Avatar"
                    className="size-[46px] rounded-full object-cover"
                  />
                ) : (
                  <div className="flex size-[46px] items-center justify-center rounded-full bg-muted">
                    {isLoading ? (
                      <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                    ) : (
                      <User className="size-5 text-muted-foreground" />
                    )}
                  </div>
                )}
                <span className="font-medium font-sans text-[#444444] text-[16px] leading-[0.96] tracking-[-0.32px]">
                  {getDisplayName()}
                  {isLoading && (
                    <span className="ml-2 text-muted-foreground text-xs">
                      (Smart Account)
                    </span>
                  )}
                </span>
              </div>
              <ChevronDown className="size-[24px] text-[#000000]" />
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
                        <span className="text-gray-500 text-sm">
                          Loading...
                        </span>
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
            <DropdownMenuItem onClick={() => logout()}>
              <Unlink className="mr-2 size-4" />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex size-[56px] items-center justify-center rounded-[100px] border-[#e6e6e6] border-[0.4px] p-[11px] transition-colors hover:bg-gray-50"
            >
              <Bell className="size-[24px]" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-sm"
            collisionPadding={16}
            sideOffset={16}
          >
            <NotificationsDropdown
              onAction={() => setNotificationsOpen(false)}
            />
          </PopoverContent>
        </Popover>
      </div>
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
  // const { theme, toggleTheme } = useTheme()
  //
  // return (
  //   <DropdownMenu>
  //     <DropdownMenuTrigger asChild>
  //       <button
  //         type="button"
  //         className="flex size-[56px] items-center justify-center rounded-[100px] border-[#e6e6e6] border-[0.4px] p-[11px] transition-colors hover:bg-gray-50"
  //       >
  //         <LayoutGrid className="size-[24px]" />
  //       </button>
  //     </DropdownMenuTrigger>
  //     <DropdownMenuContent collisionPadding={16}>
  //       <DropdownMenuItem onClick={toggleTheme}>
  //         {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
  //       </DropdownMenuItem>
  //     </DropdownMenuContent>
  //   </DropdownMenu>
  // )
  return null
}

export const Header = () => {
  const { data: wallet, isLoading: walletLoading } = useWallet()
  const isConnected = !!wallet && !walletLoading

  return (
    <nav className="sticky top-0 z-10 flex items-center justify-between bg-background px-[36px] py-[29px]">
      <Link to="/" className="mr-auto py-2">
        <img
          src={ensMobileLogo}
          alt="ENS Logo"
          className="h-[38px] md:hidden"
        />
        <img
          src={ensLogo}
          alt="ENS Logo"
          className="hidden h-[38px] md:block"
        />
      </Link>
      <div className="flex items-center gap-[74px]">
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
      </div>
    </nav>
  )
}
