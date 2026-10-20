import { useEffect } from 'react'
import type { StablecoinBalance } from '@/lib/smart-account'
import type { TOKEN_SYMBOL } from '@/lib/tokens'

/**
 * Selects the sole payment option once balances have loaded. Leaves the choice
 * alone when the user has already picked one or several options exist.
 */
export const useAutoSelectOnlyToken = <T extends TOKEN_SYMBOL>({
  selectedToken,
  stablecoinBalances,
  isLoadingBalances,
  onSelectCoin,
}: {
  readonly selectedToken: T | undefined
  readonly stablecoinBalances: readonly StablecoinBalance[] | undefined
  readonly isLoadingBalances: boolean
  readonly onSelectCoin: (coin: T) => void
}) => {
  useEffect(() => {
    const onlyCoin = stablecoinBalances?.length === 1 && stablecoinBalances[0]
    if (selectedToken || isLoadingBalances || !onlyCoin) return
    onSelectCoin(onlyCoin.symbol as T)
  }, [selectedToken, isLoadingBalances, stablecoinBalances, onSelectCoin])
}
