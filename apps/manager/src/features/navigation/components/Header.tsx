import { Link } from '@tanstack/react-router'
import {
  Bell,
  Copy,
  CreditCard,
  LayoutGrid,
  List,
  RefreshCcw,
  Unlink,
  User,
} from 'lucide-react'
import { useState } from 'react'
// import { useBalance, useEnsAvatar, useEnsName } from 'wagmi'
import { useModal, useWallet } from '@getpara/react-sdk'
import ensLogo from '@/assets/icons/ens.svg'
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
import { useParaAccount } from '@/features/wallet/hooks/useParaAccount'
import { useTheme } from '@/hooks/use-theme'
import { useRhinestoneAccount } from '@/lib/rhinestone/useRhinestoneAccount'
// import { customSepolia } from '@/lib/wagmi'

const ConnectedContent = () => {
  const { data: wallet } = useWallet()
  const { userProfile } = useParaAccount()
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
  // const [lastFetchTime, setLastFetchTime] = useState<number>(0)

  // Use wagmi hooks for balance fetching (more efficient and consistent)
  // const { data: eoaBalance, refetch: refetchEoaBalance } = useBalance({
  //   address: address as `0x${string}`,
  //   chainId: customSepolia.id,
  // })

  // const { data: smartAccountBalance, refetch: refetchSmartAccountBalance } =
  //   useBalance({
  //     address: accountAddress as `0x${string}`,
  //     chainId: customSepolia.id,
  //     query: {
  //       enabled: !!accountAddress, // Only fetch if accountAddress exists
  //     },
  //   })

  // Manual refresh function with rate limiting
  // const refreshBalances = async () => {
  //   const now = Date.now()
  //   if (now - lastFetchTime < 5000) {
  //     // 5 second cooldown
  //     console.log('Rate limited: Please wait before refreshing again')
  //     return
  //   }

  //   setLastFetchTime(now)

  //   try {
  //     await Promise.all([refetchEoaBalance(), refetchSmartAccountBalance()])
  //   } catch (error) {
  //     console.error('Failed to refresh balances:', error)
  //   }
  // }

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

    // Show user's email if available (highest priority)
    if (userProfile?.email) {
      return userProfile.email
    }

    // Show user's name if available
    if (userProfile?.name) {
      return userProfile.name
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

  const getConnectionMethod = () => {
    if (isLoading) {
      return 'Initializing Smart Account...'
    }
    return 'Para + Rhinestone'
  }

  return (
    <div className="mr-6 flex items-center gap-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md p-2 hover:bg-accent hover:text-accent-foreground"
          >
            {ensAvatar ? (
              <img
                src={ensAvatar}
                alt="ENS Avatar"
                className="size-8 rounded-full"
              />
            ) : (
              <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                {isLoading ? (
                  <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                ) : (
                  <User className="size-4 text-muted-foreground" />
                )}
              </div>
            )}
            <span className="font-medium text-sm">
              {getDisplayName()}
              {isLoading && (
                <span className="ml-2 text-muted-foreground text-xs">
                  (Smart Account)
                </span>
              )}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <div className="p-3">
            <div className="mb-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{getDisplayName()}</div>
                  <div className="text-muted-foreground text-xs">
                    Connected via {getConnectionMethod()}
                  </div>
                </div>
                {/* <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={refreshBalances}
                >
                  <RefreshCcw className="size-3" />
                </Button> */}
              </div>
            </div>

            {/* EOA Address and Balance */}
            {address && (
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <div className="mb-1 font-medium text-muted-foreground text-xs">
                    EOA Address
                  </div>
                  {/* <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={refreshBalances}
                  >
                    <RefreshCcw className="size-3" />
                  </Button> */}
                </div>

                <div className="flex items-center justify-between rounded bg-muted p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">
                      {`${address.slice(0, 6)}...${address.slice(-4)}`}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-background"
                      onClick={() => handleCopyAddress(address)}
                    >
                      <Copy className="size-3" />
                    </Button>
                  </div>
                  {eoaEthBalance && (
                    <span className="font-bold text-white">
                      {eoaEthBalance.formattedBalance}
                    </span>
                  )}
                  {isLoadingEoaEth && (
                    <span className="font-bold text-white">
                      Loading...
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Rhinestone Smart Account Information */}
            {(isLoading || rhinestoneAccount || accountAddress) && (
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <div className="mb-1 font-medium text-muted-foreground text-xs">
                    Smart Account Address
                  </div>
                  {/* {!isLoading && rhinestoneAccount && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={refreshBalances}
                    >
                      <RefreshCcw className="size-3" />
                    </Button>
                  )} */}
                </div>

                {isLoading ? (
                  <div className="flex items-center justify-between rounded bg-muted p-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="size-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
                      <span className="text-muted-foreground">
                        Creating smart account...
                      </span>
                    </div>
                  </div>
                ) : error ? (
                  <div className="rounded bg-red-50 p-2 text-xs dark:bg-red-950/20">
                    <div className="text-red-600 dark:text-red-400">
                      Failed to create smart account
                    </div>
                    <div className="mt-1 text-red-500 text-xs dark:text-red-500">
                      {error}
                    </div>
                  </div>
                ) : rhinestoneAccount && accountAddress ? (
                  <div className="flex items-center justify-between rounded bg-muted p-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-muted-foreground">
                        {`${accountAddress.slice(0, 6)}...${accountAddress.slice(-4)}`}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-background"
                        onClick={() => handleCopyAddress(accountAddress)}
                      >
                        <Copy className="size-3" />
                      </Button>
                    </div>
                    {smartAccountEthBalance && (
                      <span className="font-bold text-white">
                        {smartAccountEthBalance.formattedBalance}
                      </span>
                    )}
                    {isLoadingSmartAccountEth && (
                      <span className="font-bold text-white">
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
                  <div className="mb-1 font-medium text-muted-foreground text-xs">
                    Token Balances
                  </div>
                  <div className="space-y-2">
                    {stablecoinBalances.map((balance, index) => (
                      <div
                        key={`${balance.address}-${index}`}
                        className="relative"
                      >
                        {/* Token Container */}
                        <div className="flex items-center justify-between rounded bg-muted p-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-muted-foreground">
                              {balance.symbol}
                            </span>
                          </div>
                          {balance.formattedBalance && (
                            <span className="font-bold text-white">
                              {balance.formattedBalance}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {copied && (
              <div className="mb-3 text-green-600 text-xs dark:text-green-400">
                Copied!
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

          <DropdownMenuItem asChild>
            {/* @ts-expect-error route doesn't exist yet */}
            <Link to="/transactions">
              <List className="mr-2 size-4" />
              All Transactions
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Manage Wallet */}
          <DropdownMenuItem onClick={() => openModal()}>
            <User className="mr-2 size-4" />
            Manage Wallet
          </DropdownMenuItem>

          {/* Disconnect */}
          <DropdownMenuItem
            onClick={() => openModal()}
          >
            <Unlink className="mr-2 size-4" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon">
            <Bell className="size-5" />
          </Button>
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
        onClick={handleConnect}
        disabled={walletLoading}
        size="lg"
      >
        {walletLoading ? 'Loading...' : 'Connect Wallet'}
      </Button>
    </div>
  )
}

const Menu = () => {
  const { theme, toggleTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <LayoutGrid className="size-5" />
        </Button>
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
    <nav className="sticky top-0 z-10 flex items-center justify-end bg-background p-8">
      <Link to="/" className="mr-auto">
        <img src={ensLogo} alt="ENS Logo" className="h-8" />
      </Link>
      {isConnected ? <ConnectedContent /> : <DisconnectedContent />}
      <Menu />
    </nav>
  )
}
