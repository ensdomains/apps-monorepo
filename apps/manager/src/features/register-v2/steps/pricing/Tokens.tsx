import {
  type SUPPORTED_TOKEN,
  TOKENS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { match, P } from 'ts-pattern'
import { DAI, USDCIcon, USDTIcon } from '@/components/atoms/StableCoinsIcons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { STABLECOINS } from '@/features/register/utils'
import type { StablecoinBalance } from '@/lib/smart-account'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { cn } from '@/lib/utils'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { hasInsufficientBalance } from '@/utils/payment'
import { useRegistrationV2Context } from '../../machines/RegistrationV2UiContext'
import { getPricingQueryOptions } from '../../queries/pricing'

export const TokensContent = () => {
  const { label, uiActor } = useRegistrationV2Context()
  const [searchQuery, setSearchQuery] = useState('')
  const { stablecoinBalances, isLoadingBalances, isConnected } =
    useSmartAccountContext()
  const [duration, selectedToken] = useSelector(
    uiActor,
    (state) => [state.context.duration, state.context.selectedToken] as const,
  )

  const hasBalances = (stablecoinBalances?.length || 0) > 0

  const pricingQuery = useQuery({
    ...getPricingQueryOptions(label, duration, TOKENS.USDC.symbol),
    select: (data) =>
      decimalBigintToNumber(data.totalPrice, TOKENS.USDC.decimals),
  })

  // Filter stablecoins based on search query
  const filteredStablecoins = useMemo(() => {
    if (!stablecoinBalances || stablecoinBalances.length === 0) return []
    if (!searchQuery.trim()) return stablecoinBalances

    const query = searchQuery.toLowerCase().trim()
    return stablecoinBalances.filter(
      (coin) =>
        coin.symbol.toLowerCase().includes(query) ||
        'Sepolia'.toLowerCase().includes(query) ||
        `Sepolia ${coin.symbol}`.toLowerCase().includes(query),
    )
  }, [stablecoinBalances, searchQuery])

  const onSelectCoin = (coin: SUPPORTED_TOKEN) => {
    uiActor.send({ type: 'pricing.token.select', token: coin })
  }

  const selectedCoinBalance = stablecoinBalances?.find(
    (coin) => coin.symbol === selectedToken,
  )

  const hasSufficientBalanceForSelectedCoin =
    selectedCoinBalance &&
    pricingQuery.data &&
    decimalBigintToNumber(
      BigInt(selectedCoinBalance.balance),
      selectedCoinBalance.decimals,
    ) >= pricingQuery.data

  const actionDisabled =
    !isConnected ||
    !selectedToken ||
    pricingQuery.isLoading ||
    !hasBalances ||
    !hasSufficientBalanceForSelectedCoin

  return (
    <div className="flex min-h-[500px] flex-col justify-between gap-4 px-4">
      <div className="flex flex-col gap-4">
        {/* Header Section */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-col items-center gap-2">
            <h2 className="text-center font-medium text-2xl text-ens-peridot-dense tracking-wide">
              Select coin
            </h2>
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-center font-normal text-ens-gray text-xs tracking-tight">
                Stables accepted
              </p>
              {/* Stablecoin icons */}
              <div className="flex items-center gap-1">
                <USDTIcon className="h-7 w-7" />
                <USDCIcon className="h-7 w-7" />
                <DAI className="h-7 w-7" />
              </div>
            </div>
          </div>

          {/* Search Input */}
          <div className="w-2/3">
            <Input
              aria-label="Search coins"
              className="h-9 rounded border-ens-gray-two"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search coins"
              startIcon={<Search className="h-4 w-4 text-ens-gray" />}
              type="text"
              value={searchQuery}
            />
          </div>
        </div>

        {/* Coin List */}
        <div className="flex flex-col gap-8">
          {match({
            isLoadingBalances,
            hasBalances,
            filteredStablecoins: filteredStablecoins.length,
            isConnected,
            pricingLoading: pricingQuery.isLoading,
          })
            .with({ isConnected: false }, () => (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-2 text-ens-gray text-sm">
                  Please connect your wallet first
                </div>
                <div className="text-ens-gray-three text-xs">
                  You need to connect a wallet to see your stablecoin balances
                </div>
              </div>
            ))
            .with({ isLoadingBalances: true }, () => (
              <div className="flex items-center justify-center py-8">
                <div className="text-ens-gray-two text-sm">
                  Loading your stablecoin balances...
                </div>
              </div>
            ))
            .with({ pricingLoading: true }, () => (
              <div className="flex items-center justify-center py-8">
                <div className="text-ens-gray-two text-sm">
                  Loading pricing...
                </div>
              </div>
            ))
            .with({ filteredStablecoins: 0 }, () => (
              <div className="flex min-h-60 flex-col items-center justify-center rounded-xl bg-neutral-100 py-12">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white">
                  <Search className="h-8 w-8 text-ens-gray" />
                </div>
                <h3 className="mb-2 font-normal text-base text-ens-blue-dark">
                  No coins found
                </h3>
                <p className="max-w-56 text-center text-base text-ens-gray">
                  Try searching for a different coin or chain
                </p>
              </div>
            ))
            .with({ filteredStablecoins: P.number.gt(0) }, () => (
              <div className="flex flex-col gap-6">
                {filteredStablecoins.map((stablecoin) => (
                  <StableCoin
                    key={stablecoin.address}
                    onSelectCoin={onSelectCoin}
                    priceUSD={pricingQuery.data ?? 0}
                    selectedCoin={selectedToken}
                    stablecoin={stablecoin}
                  />
                ))}
              </div>
            ))
            .otherwise(() => undefined)}
        </div>
      </div>

      {/* Confirm Button */}
      <Button
        className={cn(
          'h-20 w-full rounded bg-ens-gray-two font-medium font-mono text-ens-gray-dark text-sm uppercase tracking-wider',
          'hover:bg-ens-gray-two',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !actionDisabled && 'bg-ens-blue text-white hover:bg-ens-blue-hover',
        )}
        disabled={actionDisabled}
        onClick={() => uiActor.send({ type: 'pricing.step.next' })}
      >
        Confirm Payment
      </Button>
    </div>
  )
}

const StableCoin = ({
  stablecoin,
  selectedCoin,
  priceUSD,
  onSelectCoin,
}: {
  stablecoin: StablecoinBalance
  selectedCoin: SUPPORTED_TOKEN | undefined
  priceUSD: number
  onSelectCoin: (coin: SUPPORTED_TOKEN) => void
}) => {
  const isSelected = selectedCoin === stablecoin.symbol
  // Find the matching icon from STABLECOINS
  const coinConfig = STABLECOINS[stablecoin.symbol as keyof typeof STABLECOINS]
  const IconComponent = coinConfig?.icon || USDCIcon

  // Check if this coin has insufficient balance
  const coinBalanceUSD = decimalBigintToNumber(
    BigInt(stablecoin.balance),
    stablecoin.decimals,
  )
  const hasInsufficientBalanceForCoin =
    priceUSD > 0 && hasInsufficientBalance(coinBalanceUSD, priceUSD)

  return (
    <button
      className={cn(
        'flex h-11 items-center justify-between rounded px-2.5 py-4 transition-colors',
        isSelected ? 'bg-ens-blue-light' : 'hover:bg-ens-gray-two/50',
        hasInsufficientBalanceForCoin && 'cursor-not-allowed opacity-50',
      )}
      disabled={hasInsufficientBalanceForCoin}
      key={stablecoin.address}
      onClick={() => onSelectCoin(stablecoin.symbol as SUPPORTED_TOKEN)}
      type="button"
    >
      <div className="flex items-center gap-2">
        {/* Coin icon with chain badge */}
        <div className="relative h-8 w-8">
          <IconComponent className="h-8 w-8" />
          {/* Chain badge - Sepolia */}
          <div className="-bottom-0.5 -right-0.5 absolute flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ens-peridot-core">
            <span className="text-[0.5rem] text-white leading-none">S</span>
          </div>
        </div>
        <p className="text-ens-gray-dark text-sm tracking-wide">
          {stablecoin.symbol}
        </p>
      </div>
      <div className="flex flex-col items-end">
        <div className="flex items-baseline gap-1.5">
          <p
            className={cn(
              'text-right text-base tracking-wide',
              hasInsufficientBalanceForCoin
                ? 'text-ens-error'
                : 'text-ens-gray-dark',
            )}
          >
            {formatUsd(coinBalanceUSD)}
          </p>
          <span className="text-[#A0A4A6] text-sm">available</span>
        </div>
        {hasInsufficientBalanceForCoin && priceUSD > 0 && (
          <p className="text-ens-error text-xs">Need {formatUsd(priceUSD)}</p>
        )}
      </div>
    </button>
  )
}
