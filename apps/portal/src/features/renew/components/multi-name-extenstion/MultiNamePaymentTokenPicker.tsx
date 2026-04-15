import { ERC20_ABI } from '@ens-apps/transaction-manager/contracts/abis/ERC20.abi'
import { useQueries } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { formatUnits } from 'viem'
import { useConfig, useConnection } from 'wagmi'
import { readContractsQueryOptions } from 'wagmi/query'
import { DAIcon } from '@/assets/dai-icon'
import { USDCIcon } from '@/assets/usdc-icon'
import { MessageCard } from '@/components/ui/message-card'
import { getRegistrationPriceQueryOptions } from '@/features/register/hooks/useRegistrationPrice'
import type { TokenWithPriceAndBalance } from '@/features/register/utils/tokenData'
import {
  DAI_DECIMALS,
  SUPPORTED_TOKENS,
  USDC_DECIMALS,
} from '@/lib/constants/tokens'
import { cn } from '@/lib/utils'
import { sepoliaWithEns } from '@/lib/wagmi'

const PAYMENT_TOKENS = [
  {
    symbol: 'USDC' as const,
    address: SUPPORTED_TOKENS.USDC,
    decimals: USDC_DECIMALS,
    Icon: USDCIcon,
  },
  {
    symbol: 'DAI' as const,
    address: SUPPORTED_TOKENS.DAI,
    decimals: DAI_DECIMALS,
    Icon: DAIcon,
  },
] as const

const Skeleton = () => (
  <div className="space-y-4">
    <div className="h-5 w-40 bg-quartz-100 animate-pulse rounded-md" />
    <div className="space-y-2">
      <div className="h-16 w-full bg-quartz-100 animate-pulse rounded-lg" />
      <div className="h-16 w-full bg-quartz-100 animate-pulse rounded-lg" />
    </div>
  </div>
)

type MultiNamePaymentTokenPickerProps = {
  readonly names: readonly string[]
  readonly duration: number
  readonly onSelectionChange: (token: TokenWithPriceAndBalance | null) => void
}

export const MultiNamePaymentTokenPicker = ({
  names,
  duration,
  onSelectionChange,
}: MultiNamePaymentTokenPickerProps) => {
  const config = useConfig()
  const { address } = useConnection()
  const [selectedToken, setSelectedToken] = useState<Address | null>(null)

  // Fetch balances + prices for all names × both tokens
  const [balancesQuery, ...priceQueries] = useQueries({
    queries: [
      {
        ...readContractsQueryOptions(config, {
          contracts: PAYMENT_TOKENS.map((token) => ({
            address: token.address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: address ? [address] : undefined,
            chainId: sepoliaWithEns.id,
          })),
        }),
        enabled: Boolean(address),
      },
      // USDC prices for all names
      ...names.map((name) =>
        getRegistrationPriceQueryOptions({
          name,
          duration,
          token: SUPPORTED_TOKENS.USDC,
          owner: address,
        }),
      ),
      // DAI prices for all names
      ...names.map((name) =>
        getRegistrationPriceQueryOptions({
          name,
          duration,
          token: SUPPORTED_TOKENS.DAI,
          owner: address,
        }),
      ),
    ],
  })

  const isLoading =
    balancesQuery.isLoading || priceQueries.some((q) => q.isLoading)

  if (isLoading) return <Skeleton />

  const balances = (balancesQuery.data ?? []).map((balance) =>
    balance.status === 'success' && balance.result !== undefined
      ? BigInt(balance.result)
      : 0n,
  )

  // Sum totals per token as bigints to avoid float drift
  const usdcPrices = priceQueries.slice(0, names.length)
  const daiPrices = priceQueries.slice(names.length)

  const sumBase = (queries: typeof priceQueries): bigint =>
    queries.reduce((sum, q) => {
      const data = q.data as { base?: bigint } | undefined
      return data?.base != null ? sum + data.base : sum
    }, 0n)

  const usdcTotalBase = sumBase(usdcPrices)
  const daiTotalBase = sumBase(daiPrices)

  const tokenData: TokenWithPriceAndBalance[] = [
    {
      ...PAYMENT_TOKENS[0],
      price: {
        base: usdcTotalBase,
        premium: 0n,
        total: usdcTotalBase,
        decimals: USDC_DECIMALS,
        hasPremium: false,
      },
      balance: balances[0] ?? 0n,
    },
    {
      ...PAYMENT_TOKENS[1],
      price: {
        base: daiTotalBase,
        premium: 0n,
        total: daiTotalBase,
        decimals: DAI_DECIMALS,
        hasPremium: false,
      },
      balance: balances[1] ?? 0n,
    },
  ]

  const noSupportedTokenHasSufficientBalance = tokenData.every(
    (token) => token.balance < token.price.total,
  )

  const handleSelect = (token: TokenWithPriceAndBalance) => {
    setSelectedToken(token.address)
    onSelectionChange(token)
  }

  return (
    <>
      <h2 className="text-base font-medium">Select payment method</h2>
      {noSupportedTokenHasSufficientBalance ? (
        <MessageCard
          variant="warning"
          icon={<AlertTriangle className="size-6" />}
          title="Insufficient balance"
          className="xl:min-w-none"
          titleClassName="text-base text-inherit font-medium"
          descriptionClassName="text-sm text-inherit"
          description="You'll need to hold USDC or DAI in your connected wallet to complete the renewal."
        />
      ) : (
        <div className="space-y-2">
          {tokenData.map((token) => {
            const hasSufficientBalance = token.balance >= token.price.total

            return (
              <button
                key={token.symbol}
                type="button"
                onClick={() => handleSelect(token)}
                disabled={!hasSufficientBalance}
                className={cn(
                  'flex w-full cursor-pointer items-center justify-between rounded-lg border border-border p-4 text-left transition-colors',
                  selectedToken === token.address
                    ? 'bg-muted'
                    : 'hover:bg-muted/30',
                  !hasSufficientBalance && 'cursor-not-allowed opacity-60',
                )}
              >
                <div className="flex items-center gap-1">
                  <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden">
                    <token.Icon className="size-8 min-w-0 shrink-0" />
                  </div>
                  <p className="font-medium">{token.symbol}</p>
                </div>
                <div className="text-right">
                  <p className="font-normal">
                    {Number(
                      formatUnits(token.balance, token.decimals),
                    ).toLocaleString()}
                  </p>
                  {hasSufficientBalance ? (
                    <p className="text-muted-foreground text-xs">available</p>
                  ) : (
                    <p className="text-destructive text-xs">
                      Insufficient balance
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
