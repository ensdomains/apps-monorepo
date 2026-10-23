export function parseBalance(balance?: string): number {
  if (!balance) return 0
  const cleaned = balance.replace(/[$,]/g, '').trim()
  const withoutToken = cleaned.replace(/\s*(USDC|DAI|USDT|ETH)\s*/i, '').trim()
  const parsed = parseFloat(withoutToken)
  return Number.isNaN(parsed) ? 0 : parsed
}

export function hasInsufficientBalance(
  balance: number | string | undefined,
  priceUSD: number,
): boolean {
  if (!priceUSD || priceUSD <= 0) return false

  const balanceValue =
    typeof balance === 'string' ? parseBalance(balance) : (balance ?? 0)

  return balanceValue < priceUSD
}
