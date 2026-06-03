import {
  type SUPPORTED_TOKEN,
  TOKENS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useSelector } from '@xstate/react'
import { match, P } from 'ts-pattern'
import { zeroAddress } from 'viem'
import { DAI, USDCIcon, USDTIcon } from '@/components/atoms/StableCoinsIcons'
import { DomainAttributePill } from '@/components/molecules/DomainResultCard/DomainAttributePill'
import { Button } from '@/components/ui/button'
import type { StablecoinBalance } from '@/lib/smart-account'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { cn } from '@/lib/utils'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { getRegistrationV2AvailabilityQueryOptions } from '../../../data/queries/availability.query'
import { getPricingQueryOptions } from '../../../data/queries/pricing.query'
import { useRegistrationV2Context } from '../../../state/registrationUi.context'
import { getPremiumLabel } from '../lib/premiumLabel'
import { PriceCooldownPill } from './PriceCooldownPill'
import { TokenListItem } from './TokenListItem'

const MEDIUM_NAME_CHAR_THRESHOLD = 10
const LONG_NAME_CHAR_THRESHOLD = 43

const getDomainSizeClasses = (domainName: string): string => {
  const charCount = Array.from(domainName).length
  if (charCount > LONG_NAME_CHAR_THRESHOLD) return 'text-[22px]'
  if (charCount >= MEDIUM_NAME_CHAR_THRESHOLD) return 'text-[32px]'
  return 'text-[40px]'
}

export const TokenPickerContent = () => {
  const { t } = useLingui()
  const { label, uiActor } = useRegistrationV2Context()
  const account = useSmartAccountContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [duration, selectedToken] = useSelector(
    uiActor,
    (state) => [state.context.duration, state.context.selectedToken] as const,
  )
  const ownerAddress = account.ownerAddress ?? zeroAddress

  const pricingQuery = useQuery({
    ...getPricingQueryOptions(
      label,
      ownerAddress,
      duration,
      selectedToken ?? TOKENS.USDC.symbol,
    ),
    enabled: selectedToken !== undefined,
    select: (data) => ({
      basePriceNumber: decimalBigintToNumber(
        data.basePrice,
        selectedToken ? TOKENS[selectedToken].decimals : TOKENS.USDC.decimals,
      ),
      premiumPriceNumber: decimalBigintToNumber(
        data.premium,
        selectedToken ? TOKENS[selectedToken].decimals : TOKENS.USDC.decimals,
      ),
      totalPriceNumber: decimalBigintToNumber(
        data.totalPrice,
        selectedToken ? TOKENS[selectedToken].decimals : TOKENS.USDC.decimals,
      ),
      rawPrice: data.totalPrice,
    }),
  })

  const onSelectCoin = (coin: SUPPORTED_TOKEN) => {
    uiActor.send({ type: 'pricing.token.select', token: coin })
  }

  const availabilityMutation = useMutation({
    mutationFn: async () => {
      return queryClient.fetchQuery({
        ...getRegistrationV2AvailabilityQueryOptions(`${label}.eth`),
        staleTime: 0,
      })
    },
    onSuccess: (availability) => {
      if (!pricingQuery.data || !selectedToken) return

      if (!availability.isAvailable) {
        navigate({
          replace: true,
          to: '/$name',
          params: { name: `${label}.eth` },
        })
        return
      }

      uiActor.send({
        type: 'registration.start',
        label,
        duration: BigInt(Math.ceil(duration)),
        token: selectedToken,
        totalPrice: pricingQuery.data.rawPrice,
        account,
        basePriceNumber: pricingQuery.data.basePriceNumber,
        premiumPriceNumber: pricingQuery.data.premiumPriceNumber,
      })
    },
  })

  const { stablecoinBalances, isLoadingBalances, isConnected } =
    useSmartAccountContext()

  return (
    <TokenPickerContentBase
      errorMessage={
        availabilityMutation.isError
          ? t`We couldn't confirm that ${label}.eth is still available. Please try again.`
          : null
      }
      isConnected={isConnected}
      isInPriceCooldown={(pricingQuery.data?.premiumPriceNumber ?? 0) > 0}
      isLoadingBalances={isLoadingBalances}
      label={label}
      onNext={() => availabilityMutation.mutate()}
      onSelectCoin={onSelectCoin}
      pricingData={pricingQuery.data?.totalPriceNumber}
      pricingLoading={pricingQuery.isLoading}
      selectedToken={selectedToken}
      stablecoinBalances={stablecoinBalances}
    />
  )
}

export const TokenPickerContentBase = ({
  label,
  pricingLoading,
  pricingData,
  isInPriceCooldown = false,
  selectedToken,
  errorMessage,
  onSelectCoin,
  onNext,
  stablecoinBalances,
  isLoadingBalances,
  isConnected,
}: {
  label: string
  pricingLoading: boolean
  pricingData: number | undefined
  isInPriceCooldown?: boolean
  selectedToken: SUPPORTED_TOKEN | undefined
  errorMessage?: string | null
  onSelectCoin: (coin: SUPPORTED_TOKEN) => void
  onNext: () => void
  stablecoinBalances: StablecoinBalance[]
  isLoadingBalances: boolean
  isConnected: boolean
}) => {
  const { t } = useLingui()
  const domainName = `${label}.eth`
  const premiumLabel = getPremiumLabel(label.length)

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
    <div className="flex h-full flex-1 flex-col gap-6 px-4 pt-2 pb-6">
      <div className="flex flex-1 flex-col items-center gap-8 overflow-y-auto">
        <div className="flex w-full min-w-0 flex-col items-center gap-4 rounded-xl bg-[rgb(250,250,250)] px-6 py-8">
          {(premiumLabel || isInPriceCooldown) && (
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
              {premiumLabel && (
                <DomainAttributePill
                  label={t(premiumLabel.label)}
                  variant={premiumLabel.variant}
                />
              )}
              {isInPriceCooldown && <PriceCooldownPill />}
            </div>
          )}
          <span
            className={cn(
              'wrap-anywhere w-full min-w-0 text-center font-medium font-semi-mono',
              'whitespace-normal leading-ens-none tracking-[-0.8px]',
              'text-ens-gray',
              getDomainSizeClasses(domainName),
            )}
            title={domainName}
          >
            {domainName}
          </span>

          <div className="flex items-baseline gap-2">
            <span className="text-center font-normal text-ens-gray-three text-lg leading-[100%] tracking-[-0.36px]">
              <Trans>for</Trans>
            </span>
            <span className="font-medium text-ens-gray-dark text-xl leading-[100%] tracking-[0.36px]">
              {formatUsd(pricingData ?? 0)}
            </span>
            <span className="text-center font-normal text-ens-gray-three text-lg leading-[100%] tracking-[-0.36px]">
              USD
            </span>
          </div>
        </div>

        <div className="flex w-full flex-col gap-6">
          <h2 className="text-center font-medium text-[18px] leading-ens-none">
            <Trans>Select payment</Trans>
          </h2>
          {match({
            isLoadingBalances,
            hasBalances,
            stablecoinsCount: stablecoinBalances?.length ?? 0,
            isConnected,
            pricingLoading,
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
            .with({ stablecoinsCount: 0 }, () => (
              <div className="flex items-center justify-center py-8">
                <div className="text-ens-gray-two text-sm">
                  <Trans>No stablecoins available</Trans>
                </div>
              </div>
            ))
            .with({ stablecoinsCount: P.number.gt(0) }, () => (
              <div className="flex max-h-56 flex-col gap-3 overflow-y-auto pr-1">
                {stablecoinBalances.map((stablecoin) => (
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

          {errorMessage && (
            <p className="text-center text-ens-error text-sm">{errorMessage}</p>
          )}

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
        <Trans>Buy Name</Trans>
      </Button>
    </div>
  )
}
