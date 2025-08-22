import { useWeb3Auth } from '@web3auth/modal/react'
import { Coins, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { formatEther } from 'viem'
import { StablecoinItem } from '@/components/molecules/StablecoinList/StablecoinItem'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  aaService,
  type StablecoinBalance,
} from '@/lib/web3Auth/accountAbstractionService'
import { useAccountAbstraction } from '@/lib/web3Auth/useAccountAbstraction'
import { web3AuthService } from '@/lib/web3Auth/web3AuthService'

export function Balance() {
  const [smartAccountBalance, setSmartAccountBalance] = useState<string | null>(
    null,
  )
  const [_smartAccountAddress, setSmartAccountAddress] = useState<
    string | null
  >(null)
  const [smartAccountStablecoinBalances, setSmartAccountStablecoinBalances] =
    useState<StablecoinBalance[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { web3Auth } = useWeb3Auth()
  const { isUsingAA, smartAccountInfo } = useAccountAbstraction()

  // Initialize Web3Auth service when modal is available
  useEffect(() => {
    if (web3Auth && !web3AuthService.web3AuthInstance) {
      web3AuthService.setWeb3AuthModal(web3Auth)
    } else if (web3Auth && web3AuthService.web3AuthInstance) {
      // Force refresh provider if already initialized
      web3AuthService.refreshProvider()
    }
  }, [web3Auth])

  const fetchSmartAccountBalances = useCallback(async () => {
    if (
      web3AuthService.isConnected &&
      web3AuthService.isReady &&
      isUsingAA &&
      smartAccountInfo?.address
    ) {
      try {
        setIsLoading(true)
        setError(null)

        setSmartAccountAddress(smartAccountInfo.address)

        // Get smart account ETH balance
        const publicClient = web3AuthService.getPublicClient()
        const smartAccountEthBalance = await publicClient.getBalance({
          address: smartAccountInfo.address as `0x${string}`,
        })
        setSmartAccountBalance(formatEther(smartAccountEthBalance))

        // Get smart account stablecoin balances using the service
        const stablecoinBalances = await aaService.getStablecoinBalances(
          smartAccountInfo.address as `0x${string}`,
        )
        setSmartAccountStablecoinBalances(stablecoinBalances)
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to fetch smart account balances',
        )
      } finally {
        setIsLoading(false)
      }
    } else {
      setSmartAccountBalance(null)
      setSmartAccountAddress(null)
      setSmartAccountStablecoinBalances([])
    }
  }, [isUsingAA, smartAccountInfo?.address])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    const startTime = Date.now()
    await fetchSmartAccountBalances()
    const elapsedTime = Date.now() - startTime
    if (elapsedTime < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 1000 - elapsedTime))
    }
    setIsRefreshing(false)
  }

  useEffect(() => {
    fetchSmartAccountBalances()
  }, [fetchSmartAccountBalances])

  // Only show if connected and using AA
  if (
    !web3AuthService.isConnected ||
    !web3AuthService.isReady ||
    !isUsingAA ||
    !smartAccountInfo?.address
  ) {
    return null
  }

  return (
    <div className="space-y-3">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="font-medium text-muted-foreground text-xs">
            Balances
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
        >
          <RefreshCw className={cn('size-3', isRefreshing && 'animate-spin')} />
        </Button>
      </div>

      {/* Smart Account ETH Balance */}
      <div className="flex items-center justify-between rounded-md border p-2">
        <span className="text-sm">ETH</span>
        <span className="font-medium text-sm">
          {smartAccountBalance
            ? `${parseFloat(smartAccountBalance).toFixed(4)} ETH`
            : 'Loading...'}
        </span>
      </div>

      {/* Smart Account Stablecoin Balances */}
      {smartAccountStablecoinBalances.length > 0 && (
        <div className="space-y-2">
          {smartAccountStablecoinBalances.map((stablecoin) => (
            <StablecoinItem
              key={stablecoin.address}
              stablecoin={{
                address: stablecoin.address,
                symbol: stablecoin.symbol,
                formattedBalance: stablecoin.formattedBalance,
              }}
              selectable={false}
            />
          ))}
        </div>
      )}

      {/* No stablecoins message */}
      {smartAccountStablecoinBalances.length === 0 && !isLoading && (
        <div className="py-2 text-center">
          <Coins className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
          <p className="text-muted-foreground text-xs">
            No stablecoin balances found
          </p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && !smartAccountBalance && (
        <div className="py-2 text-center">
          <div className="mx-auto mb-1 h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground"></div>
          <p className="text-muted-foreground text-xs">
            Loading smart account balances...
          </p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2">
          <p className="text-destructive text-xs">Error: {error}</p>
        </div>
      )}
    </div>
  )
}
