import { useWeb3Auth } from '@web3auth/modal/react'
import { Coins, RefreshCw, Wallet } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { type StablecoinData, StablecoinList } from '@/components/molecules'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'
import {
  type StablecoinBalance,
  web3AuthService,
} from '@/lib/web3Auth/web3AuthService'

export function Balance() {
  const [balance, setBalance] = useState<string | null>(null)
  const [stablecoinBalances, setStablecoinBalances] = useState<
    StablecoinBalance[]
  >([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { web3Auth } = useWeb3Auth()
  const { theme } = useTheme()

  const isDark = theme === 'dark'

  // Initialize Web3Auth service when modal is available
  useEffect(() => {
    if (web3Auth && !web3AuthService.web3AuthInstance) {
      console.log('🔧 Initializing Web3Auth service...')
      web3AuthService.setWeb3AuthModal(web3Auth)
    } else if (web3Auth && web3AuthService.web3AuthInstance) {
      // Force refresh provider if already initialized
      console.log('🔄 Refreshing Web3Auth provider...')
      web3AuthService.refreshProvider()
    }
  }, [web3Auth])

  const fetchBalances = useCallback(async () => {
    if (web3AuthService.isConnected && web3AuthService.isReady) {
      try {
        setIsLoading(true)
        setError(null)

        console.log('🔍 Fetching balances...')
        console.log('📱 Web3Auth connected:', web3AuthService.isConnected)
        console.log('✅ Web3Auth ready:', web3AuthService.isReady)
        console.log('🔧 Web3Auth initialized:', web3AuthService.isInitialized)
        console.log('🔧 Web3Auth status:', web3AuthService.getStatus())

        // Fetch ETH balance
        const balanceValue = await web3AuthService.getBalance()
        setBalance(balanceValue)
        console.log('💰 ETH balance:', balanceValue)

        // Fetch stablecoin balances
        console.log('🪙 Fetching stablecoin balances...')
        const stablecoins = await web3AuthService.getStablecoinBalances()
        setStablecoinBalances(stablecoins)
        console.log('🪙 Stablecoin balances:', stablecoins)
        console.log('📊 Number of stablecoins found:', stablecoins.length)
      } catch (err) {
        console.error('❌ Failed to fetch balances:', err)
        setError(
          err instanceof Error ? err.message : 'Failed to fetch balances',
        )
      } finally {
        setIsLoading(false)
      }
    } else {
      console.log('❌ Web3Auth not ready:', {
        isConnected: web3AuthService.isConnected,
        isReady: web3AuthService.isReady,
        isInitialized: web3AuthService.isInitialized,
      })
      console.log('🔧 Full Web3Auth status:', web3AuthService.getStatus())
      setBalance(null)
      setStablecoinBalances([])
    }
  }, [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    const startTime = Date.now()
    await fetchBalances()
    const elapsedTime = Date.now() - startTime
    if (elapsedTime < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 1000 - elapsedTime))
    }
    setIsRefreshing(false)
  }

  useEffect(() => {
    fetchBalances()
  }, [fetchBalances])

  // Only show if connected
  if (!web3AuthService.isConnected || !web3AuthService.isReady) {
    return null
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-3 shadow-sm backdrop-blur-sm',
        isDark
          ? 'border-gray-700/50 bg-gray-900/50'
          : 'border-gray-200/50 bg-white/50',
      )}
    >
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet
            className={cn(
              'h-4 w-4',
              isDark ? 'text-gray-400' : 'text-gray-600',
            )}
          />
          <span
            className={cn(
              'font-medium text-sm',
              isDark ? 'text-gray-300' : 'text-gray-700',
            )}
          >
            Wallet Balance
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-6 w-6 p-0 transition-all duration-200',
            isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100',
            isRefreshing && 'animate-spin',
          )}
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
        >
          <RefreshCw className="size-3" />
        </Button>
      </div>

      {/* ETH Balance */}
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border p-3',
          isDark
            ? 'border-purple-800/50 bg-gradient-to-r from-purple-950/30 to-blue-950/30'
            : 'border-purple-200/50 bg-gradient-to-r from-purple-50 to-blue-50',
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-600 font-bold text-sm text-white">
          Ξ
        </div>
        <div className="flex-1">
          <div
            className={cn(
              'font-medium text-xs',
              isDark ? 'text-gray-400' : 'text-gray-500',
            )}
          >
            Ethereum
          </div>
          <div
            className={cn(
              'font-semibold text-sm',
              isDark ? 'text-gray-100' : 'text-gray-900',
            )}
          >
            {balance ? `${parseFloat(balance).toFixed(4)} ETH` : 'Loading...'}
            {isLoading && !balance && (
              <span
                className={cn(
                  'ml-2',
                  isDark ? 'text-gray-500' : 'text-gray-400',
                )}
              >
                Loading...
              </span>
            )}
            {error && (
              <span
                className={cn(
                  'ml-2 text-xs',
                  isDark ? 'text-red-400' : 'text-red-500',
                )}
              >
                Error: {error}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stablecoin Balances */}
      {stablecoinBalances.length > 0 && (
        <StablecoinList
          stablecoins={stablecoinBalances.map(
            (stablecoin): StablecoinData => ({
              address: stablecoin.address,
              symbol: stablecoin.symbol,
              formattedBalance: stablecoin.formattedBalance,
            }),
          )}
          title="Stablecoins"
          showTitle={true}
          interactive={false}
        />
      )}

      {/* No stablecoins message */}
      {stablecoinBalances.length === 0 && !isLoading && (
        <div className="py-4 text-center">
          <Coins
            className={cn(
              'mx-auto mb-2 h-8 w-8',
              isDark ? 'text-gray-600' : 'text-gray-300',
            )}
          />
          <p
            className={cn(
              'text-xs',
              isDark ? 'text-gray-400' : 'text-gray-500',
            )}
          >
            No stablecoin balances found
          </p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && stablecoinBalances.length === 0 && (
        <div className="py-4 text-center">
          <div
            className={cn(
              'mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2',
              isDark
                ? 'border-gray-600 border-t-blue-400'
                : 'border-gray-300 border-t-blue-600',
            )}
          ></div>
          <p
            className={cn(
              'text-xs',
              isDark ? 'text-gray-400' : 'text-gray-500',
            )}
          >
            Loading balances...
          </p>
        </div>
      )}
    </div>
  )
}
