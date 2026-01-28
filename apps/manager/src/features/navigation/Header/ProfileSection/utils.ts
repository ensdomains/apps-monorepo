import { formatUnits } from 'viem'

const formatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

export const formatTokenBalance = (balance: string, decimals: number) => {
  const amount = Number(formatUnits(BigInt(balance), decimals))

  return formatter.format(amount)
}
