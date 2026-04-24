import {
  type SUPPORTED_TOKEN,
  TOKENS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { match, P } from 'ts-pattern'
import { zeroAddress } from 'viem'
import { DAI, USDCIcon, USDTIcon } from '@/components/atoms/StableCoinsIcons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { cn } from '@/lib/utils'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { getPricingQueryOptions } from '../../../data/queries/pricing.query'
import { useRegistrationV2Context } from '../../../state/registrationUi.context'
import { filterStablecoinBalances } from '../lib/tokenFilter'
import { TokenListItem } from './TokenListItem'

export const TokenPickerContent = () => {
  const { label, uiActor } = useRegistrationV2Context()
  const { ownerAddress } = useSmartAccountContext()
  const [duration, selectedToken] = useSelector(
    uiActor,
    (state) => [state.context.duration, state.context.selectedToken] as const,
  )

  const pricingQuery = useQuery({
    ...getPricingQueryOptions(
      label,
      ownerAddress ?? zeroAddress,
      duration,
      TOKENS.USDC.symbol,
    ),
    select: (data) =>
      decimalBigintToNumber(data.totalPrice, TOKENS.USDC.decimals),
  })

  const onSelectCoin = (coin: SUPPORTED_TOKEN) => {
    uiActor.send({ type: 'pricing.token.select', token: coin })
  }

  return (
    <TokenPickerContentBase
      onNext={() => uiActor.send({ type: 'pricing.step.next' })}
      onSelectCoin={onSelectCoin}
      pricingData={pricingQuery.data}
      pricingLoading={pricingQuery.isLoading}
      selectedToken={selectedToken}
    />
  )
}

export const TokenPickerContentBase = ({
  pricingLoading,
  pricingData,
  selectedToken,
  onSelectCoin,
  onNext,
}: {
  pricingLoading: boolean
  pricingData: number | undefined
  selectedToken: SUPPORTED_TOKEN | undefined
  onSelectCoin: (coin: SUPPORTED_TOKEN) => void
  onNext: () => void
}) => {
  const { t } = useLingui()
  const [searchQuery, setSearchQuery] = useState('')
  const { stablecoinBalances, isLoadingBalances, isConnected } =
    useSmartAccountContext()

  const filteredStablecoins = useMemo(
    () => filterStablecoinBalances(stablecoinBalances, searchQuery),
    [stablecoinBalances, searchQuery],
  )

  const hasBalances = (stablecoinBalances?.length || 0) > 0

  const selectedCoinBalance = stablecoinBalances?.find(
    (coin) => coin.symbol === selectedToken,
  )

  const hasSufficientBalanceForSelectedCoin =
    selectedCoinBalance &&
    pricingData &&
    decimalBigintToNumber(
      BigInt(selectedCoinBalance.balance),
      selectedCoinBalance.decimals,
    ) >= pricingData

  const canNext =
    isConnected &&
    !!selectedToken &&
    !pricingLoading &&
    hasBalances &&
    !!hasSufficientBalanceForSelectedCoin

  return (
    <div className="flex h-full flex-1 flex-col justify-between gap-4 px-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-col items-center gap-2">
            <h2 className="text-center font-medium text-2xl text-ens-peridot-dense tracking-wide">
              <Trans>Select coin</Trans>
            </h2>
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-center font-normal text-ens-gray text-xs tracking-tight">
                <Trans>Stables accepted</Trans>
              </p>
              <div className="flex items-center gap-1">
                <USDTIcon className="h-7 w-7" />
                <USDCIcon className="h-7 w-7" />
                <DAI className="h-7 w-7" />
              </div>
            </div>
          </div>

          <div className="w-full">
            <Input
              aria-label={t`Search coins`}
              className="h-9 rounded border-ens-gray-two"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t`Search coins`}
              startIcon={<Search className="h-4 w-4 text-ens-gray" />}
              type="text"
              value={searchQuery}
            />
          </div>
        </div>

        <div className="flex flex-col gap-8">
          {match({
            isLoadingBalances,
            hasBalances,
            filteredStablecoins: filteredStablecoins.length,
            isConnected,
            pricingLoading: pricingLoading,
          })
            .with({ isConnected: false }, () => (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-2 text-ens-gray text-sm">
                  <Trans>Please connect your wallet first</Trans>
                </div>
                <div className="text-ens-gray-three text-xs">
                  <Trans>
                    You need to connect a wallet to see your stablecoin balances
                  </Trans>
                </div>
              </div>
            ))
            .with({ isLoadingBalances: true }, () => (
              <div className="flex items-center justify-center py-8">
                <div className="text-ens-gray-two text-sm">
                  <Trans>Loading your stablecoin balances...</Trans>
                </div>
              </div>
            ))
            .with({ pricingLoading: true }, () => (
              <div className="flex items-center justify-center py-8">
                <div className="text-ens-gray-two text-sm">
                  <Trans>Loading pricing...</Trans>
                </div>
              </div>
            ))
            .with({ filteredStablecoins: 0 }, () => (
              <div className="flex min-h-60 flex-col items-center justify-center rounded-xl bg-neutral-100 py-12">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white">
                  <Search className="h-8 w-8 text-ens-gray" />
                </div>
                <h3 className="mb-2 font-normal text-base text-ens-blue-dark">
                  <Trans>No coins found</Trans>
                </h3>
                <p className="max-w-56 text-center text-base text-ens-gray">
                  <Trans>Try searching for a different coin or chain</Trans>
                </p>
              </div>
            ))
            .with({ filteredStablecoins: P.number.gt(0) }, () => (
              <div className="flex flex-col gap-6">
                {filteredStablecoins.map((stablecoin) => (
                  <TokenListItem
                    key={stablecoin.address}
                    onSelectCoin={onSelectCoin}
                    priceUSD={pricingData ?? 0}
                    selectedCoin={selectedToken}
                    stablecoin={stablecoin}
                  />
                ))}
              </div>
            ))
            .otherwise(() => undefined)}
        </div>
      </div>

      <Button
        className={cn(
          'h-20 w-full rounded bg-ens-gray-two font-medium font-mono text-ens-gray-dark text-sm uppercase tracking-wider',
          'hover:bg-ens-gray-two',
          'disabled:cursor-not-allowed disabled:opacity-50',
          canNext && 'bg-ens-blue text-white hover:bg-ens-blue-hover',
        )}
        disabled={!canNext}
        onClick={onNext}
      >
        <Trans>Confirm Payment</Trans>
      </Button>
    </div>
  )
}
