import { useEffect } from 'react'
import type { StablecoinBalance } from '@/lib/smart-account'
import type { TOKEN_SYMBOL } from '@/lib/tokens'

/**
 * Selects the sole payment option once balances have loaded. Leaves the choice
 * alone when the user has already picked one or several options exist.
 */
export const useAutoSelectOnlyToken = <T extends TOKEN_SYMBOL>({
  selectedToken,
  automaticToken,
  stablecoinBalances,
  isLoadingBalances,
  onSelectCoin,
}: {
  readonly automaticToken?: T
  readonly selectedToken: T | undefined
  readonly stablecoinBalances: readonly StablecoinBalance[] | undefined
  readonly isLoadingBalances: boolean
  readonly onSelectCoin: (coin: T) => void
}) => {
  useEffect(() => {
    // A fully covered registration uses its existing USDC without a payment choice.
    if (automaticToken) {
      if (selectedToken !== automaticToken) onSelectCoin(automaticToken)
      return
    }
    const onlyCoin = stablecoinBalances?.length === 1 && stablecoinBalances[0]
    if (selectedToken || isLoadingBalances || !onlyCoin) return
    onSelectCoin(onlyCoin.symbol as T)
  }, [
    automaticToken,
    selectedToken,
    isLoadingBalances,
    stablecoinBalances,
    onSelectCoin,
  ])
}
