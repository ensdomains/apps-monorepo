import { usePrivy } from '@privy-io/react-auth'
import { Link } from '@tanstack/react-router'
import {
  Bell,
  Copy,
  CreditCard,
  LayoutGrid,
  List,
  Loader2,
  RefreshCcw,
  Unlink,
  User,
} from 'lucide-react'
import { useState } from 'react'
import { useAccount, useBalance, useEnsAvatar, useEnsName } from 'wagmi'
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
import { useTheme } from '@/hooks/use-theme'
import { useRhinestoneAccount } from '@/lib/rhinestone/useRhinestoneAccount'

const ConnectedContent = () => {
  const { address } = useAccount()
  const { logout, user } = usePrivy()
  const {
    rhinestoneAccount,
    accountAddress,
    isLoading,
    stablecoinBalances,
    error,
  } = useRhinestoneAccount()

  const { data: ensName } = useEnsName({ address })
  const { data: ensAvatar } = useEnsAvatar({
    name: ensName ?? undefined,
    assetGatewayUrls: {
      ipfs: 'https://ipfs.euc.li',
    },
  })

  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [lastFetchTime, setLastFetchTime] = useState<number>(0)

  // Use wagmi hooks for balance fetching (more efficient and consistent)
  const { data: eoaBalance, refetch: refetchEoaBalance } = useBalance({
    address: address,
    chainId: 11155111, // Sepolia chain ID
  })

  const { data: smartAccountBalance, refetch: refetchSmartAccountBalance } =
    useBalance({
      address: accountAddress as `0x${string}`,
      chainId: 11155111, // Sepolia chain ID
      query: {
        enabled: !!accountAddress, // Only fetch if accountAddress exists
      },
    })

  // Manual refresh function with rate limiting
  const refreshBalances = async () => {
    const now = Date.now()
    if (now - lastFetchTime < 5000) {
      // 5 second cooldown
      console.log('Rate limited: Please wait before refreshing again')
      return
    }

    setLastFetchTime(now)

    try {
      await Promise.all([refetchEoaBalance(), refetchSmartAccountBalance()])
    } catch (error) {
      console.error('Failed to refresh balances:', error)
    }
  }

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

    // Show user's email if available
    if (user?.email?.address) {
      return user.email.address
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
    return 'Privy + Rhinestone'
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={refreshBalances}
                >
                  <RefreshCcw className="size-3" />
                </Button>
              </div>
            </div>

            {/* EOA Address and Balance */}
            {address && (
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <div className="mb-1 font-medium text-muted-foreground text-xs">
                    EOA Address
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={refreshBalances}
                  >
                    <RefreshCcw className="size-3" />
                  </Button>
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
                  {eoaBalance && (
                    <span className="font-bold text-white">
                      {parseFloat(eoaBalance.formatted).toFixed(4)}{' '}
                      ETH
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
                  {!isLoading && rhinestoneAccount && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={refreshBalances}
                    >
                      <RefreshCcw className="size-3" />
                    </Button>
                  )}
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
                    {smartAccountBalance && (
                      <span className="font-bold text-white">
                        {parseFloat(smartAccountBalance.formatted).toFixed(4)}{' '}
                        ETH
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
                    {stablecoinBalances.map((balance: any, index: number) => (
                      <div key={index} className="relative">
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

          {/* Disconnect */}
          <DropdownMenuItem onClick={() => logout()}>
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
  const { login } = usePrivy()

  return (
    <div className="mr-6 flex items-center gap-4">
      <Button onClick={login}>Connect Wallet</Button>
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
  const { ready, authenticated } = usePrivy()

  // Show loading state while Privy initializes
  if (!ready) {
    return (
      <nav className="sticky top-0 z-10 flex items-center justify-end bg-background p-8">
        <Link to="/" className="mr-auto">
          <img src={ensLogo} alt="ENS Logo" className="h-8" />
        </Link>
        <div className="mr-6 flex items-center gap-4">
          <Button disabled>
            <Loader2 className="size-4 animate-spin" />
            Loading...
          </Button>
        </div>
        <Menu />
      </nav>
    )
  }

  return (
    <nav className="sticky top-0 z-10 flex items-center justify-end bg-background p-8">
      <Link to="/" className="mr-auto">
        <img src={ensLogo} alt="ENS Logo" className="h-8" />
      </Link>
      {authenticated ? <ConnectedContent /> : <DisconnectedContent />}
      <Menu />
    </nav>
  )
}
