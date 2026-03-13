import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { match } from 'ts-pattern'
import { USDCIcon } from '@/components/atoms/StableCoinsIcons'
import { DomainAttributePill } from '@/components/molecules/DomainResultCard/DomainAttributePill'
import { Button } from '@/components/ui/button'
import { type PremiumLabel, STABLECOINS } from '@/features/register/utils'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { cn } from '@/lib/utils'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { useRegistrationV2Context } from '../../machines/RegistrationV2UiContext'
import { getPricingQueryOptions } from '../../queries/pricing'
import { startRegistrationV2 } from '../../transactions/startRegistrationV2'

export const ConfirmPayment = () => {
  const { label, uiActor } = useRegistrationV2Context()
  const account = useSmartAccountContext()
  const [duration, selectedToken] = useSelector(
    uiActor,
    (state) => [state.context.duration, state.context.selectedToken] as const,
  )

  const pricingQuery = useQuery({
    ...getPricingQueryOptions(label, duration, selectedToken),
    select: (data) => ({
      totalPriceNumber: decimalBigintToNumber(
        data.totalPrice,
        selectedToken ? TOKENS[selectedToken].decimals : 0,
      ),
      rawPrice: data.totalPrice,
    }),
  })

  const premiumLabel: PremiumLabel | undefined = match(label.length)
    .with(
      3,
      () =>
        ({ label: '3 character premium name', variant: 'premium-3' }) as const,
    )
    .with(
      4,
      () =>
        ({ label: '4 character premium name', variant: 'premium-4' }) as const,
    )
    .otherwise(() => undefined)

  const domainName = `${label}.eth`

  const selectedCoinConfig = selectedToken && STABLECOINS[selectedToken]

  const SelectedCoinIcon = selectedCoinConfig?.icon || USDCIcon

  return (
    <div className="flex min-h-[500px] flex-col justify-between gap-4 px-4">
      <div className="flex flex-col items-center gap-6">
        {/* Header */}
        <h2 className="text-center font-medium text-2xl text-ens-blue tracking-wide">
          Registering
        </h2>

        <div className="flex w-full min-w-0 flex-col items-center gap-4 rounded-xl bg-[rgb(250,250,250)] px-6 py-8">
          {premiumLabel && (
            <DomainAttributePill
              label={premiumLabel.label}
              variant={premiumLabel.variant}
            />
          )}
          <span
            className={cn(
              'w-full min-w-0 text-center font-medium font-semi-mono',
              'text-[40px] leading-[96%] tracking-[-0.8px]',
              'text-[var(--Primary-Grey,#4A5C63)]',
            )}
            title={domainName}
          >
            {domainName.length > 10
              ? `${domainName.slice(0, 10)}…`
              : domainName}
          </span>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-base text-ens-gray">for</span>
          <div className="flex items-baseline gap-1">
            <SelectedCoinIcon className="h-6 w-6 self-center" />
            <span className="font-medium text-2xl text-ens-gray tracking-tight">
              {formatUsd(pricingQuery.data?.totalPriceNumber ?? 0)}
            </span>
            <span className="text-ens-gray-three text-lg">
              {selectedToken || 'USDC'}
            </span>
          </div>
        </div>
      </div>

      <Button
        className="h-20 w-full rounded bg-ens-blue font-medium font-mono text-sm text-white uppercase tracking-wider hover:bg-ens-blue-hover"
        onClick={() => {
          const tokenPrice = pricingQuery.data?.rawPrice
          if (!tokenPrice || !selectedToken) return
          startRegistrationV2(
            {
              name: label,
              duration,
              selectedToken,
              tokenPrice,
            },
            account,
            uiActor,
            { fast: true },
          )
        }}
      >
        Buy Name
      </Button>
    </div>
  )
}
