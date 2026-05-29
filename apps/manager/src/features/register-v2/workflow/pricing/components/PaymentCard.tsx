import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { useModal } from '@getpara/react-sdk-lite'
import { Trans } from '@lingui/react/macro'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { AnimateNumber } from 'motion-plus/react'
import { zeroAddress } from 'viem'
import { DAI, USDCIcon, USDTIcon } from '@/components/atoms/StableCoinsIcons'
import { Button } from '@/components/ens-consumer/button/Button'
import { useBaseRate } from '@/features/register-v2/data/queries/baseRates.query'
import { calculateDiscount } from '@/features/register-v2/utils/discount'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { tw } from '@/utils/tailwind'
import { getPricingQueryOptions } from '../../../data/queries/pricing.query'
import { useRegistrationV2Context } from '../../../state/registrationUi.context'
import {
  PaymentCardBaseLine,
  PaymentCardPremiumLine,
} from './PaymentCardLineItems'

export const PaymentCard = () => {
  const { uiActor, label } = useRegistrationV2Context()
  const { ownerAddress } = useSmartAccountContext()

  const [duration, canNext] = useSelector(uiActor, (state) => [
    state.context.duration,
    state.can({ type: 'pricing.step.next' }),
  ])

  const baseRate = useBaseRate(label)

  const pricingQuery = useQuery({
    ...getPricingQueryOptions(
      label,
      ownerAddress ?? zeroAddress,
      duration,
      TOKENS.USDC.symbol,
    ),
    select: (data) => ({
      totalPrice: decimalBigintToNumber(data.totalPrice, TOKENS.USDC.decimals),
      basePrice: decimalBigintToNumber(data.basePrice, TOKENS.USDC.decimals),
      premiumPrice: decimalBigintToNumber(data.premium, TOKENS.USDC.decimals),
    }),
    placeholderData: keepPreviousData,
  })

  const { discountAmount } = calculateDiscount(
    pricingQuery.data?.basePrice ?? 0,
    baseRate,
    BigInt(duration),
  )

  return (
    <PaymentCardBase
      amount={pricingQuery.data?.totalPrice}
      basePrice={pricingQuery.data?.basePrice}
      canNext={canNext}
      discountAmount={discountAmount}
      isLoading={pricingQuery.isLoading || pricingQuery.isPlaceholderData}
      onNext={() => uiActor.send({ type: 'pricing.step.next' })}
      premiumAmount={pricingQuery.data?.premiumPrice}
      type="register"
    />
  )
}

export const PaymentCardBase = ({
  canNext,
  onNext,
  amount,
  isLoading,
  discountAmount,
  premiumAmount,
  basePrice,
  type,
}: {
  canNext: boolean
  onNext: () => void
  /** The grand total (basePrice + premium). Shown big at the bottom. */
  amount: number | undefined
  discountAmount?: number
  premiumAmount?: number
  /**
   * Base registration cost (excludes the one-time cooldown premium). When
   * provided alongside a non-zero `premiumAmount`, the card splits the
   * breakdown into a "Registration" line and a "Cooldown fee" line so the
   * user can see both components — not just the cooldown — feeding into the
   * grand total. Without it, only the cooldown line shows (original
   * behaviour), preserving the renew flow which doesn't pass basePrice.
   */
  basePrice?: number
  isLoading: boolean
  type: 'register' | 'renew'
}) => {
  const { isConnected } = useSmartAccountContext()
  const { openModal, isOpen } = useModal()

  return (
    <div
      className={tw(
        'flex flex-1 flex-col items-center justify-between gap-8',
        'rounded-xl border-[#DDDDDE] border-[0.5px] bg-white px-12 py-6 shadow-temp-card',
      )}
    >
      <div className="w-full max-w-55 space-y-3 text-center">
        {/*
          Break down `total = base + premium` when the name is in cooldown so
          the user sees both contributions. The base-only / renew flow keeps
          the old shape (TOTAL only). See PaymentCardPremiumLine for the
          row layout.
        */}
        {premiumAmount !== undefined && premiumAmount > 0 && (
          <div className="space-y-2">
            {basePrice !== undefined && (
              <PaymentCardBaseLine
                basePrice={basePrice}
                isLoading={isLoading}
              />
            )}
            <PaymentCardPremiumLine
              isLoading={isLoading}
              premiumAmount={premiumAmount}
            />
          </div>
        )}

        <p className="text-ens-lapis-surface text-xs uppercase">
          <Trans>Total</Trans>
        </p>

        <div className="flex items-end justify-center gap-1.5">
          <span
            className={tw(
              'font-medium text-4xl text-ens-blue-midnight leading-ens-none md:text-5xl',
              isLoading && 'animate-pulse',
            )}
          >
            <AnimateNumber
              format={{
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              }}
            >
              {amount ?? 0}
            </AnimateNumber>
          </span>
          <span className="font-normal text-base text-ens-blue-midnight leading-7">
            <Trans>USD</Trans>
          </span>
        </div>

        <div
          className={tw(
            'w-full rounded bg-ens-signal-success-300 px-4 py-2 transition-opacity duration-300',
            !discountAmount && 'opacity-0',
          )}
        >
          <span className="font-normal text-2xl text-ens-peridot-core leading-ens-none">
            <Trans>
              Save{' '}
              <AnimateNumber
                format={{
                  style: 'currency',
                  currency: 'USD',
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                }}
              >
                {discountAmount ?? 0}
              </AnimateNumber>
            </Trans>
          </span>
        </div>
      </div>

      <div className="flex w-full flex-col items-center justify-between gap-3">
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-center font-normal text-ens-gray text-xs tracking-tight">
            <Trans>Stables accepted</Trans>
          </p>
          {/* Stablecoin icons */}
          <div className="flex items-center gap-1">
            <USDTIcon className="h-7 w-7" />
            <USDCIcon className="h-7 w-7" />
            <DAI className="h-7 w-7" />
          </div>
        </div>

        {isConnected ? (
          <Button
            className="w-full font-medium font-mono uppercase tracking-widest"
            color="blue"
            disabled={!canNext}
            onClick={onNext}
            size="lg"
          >
            <Trans>Pay with stablecoins</Trans>
          </Button>
        ) : (
          <Button
            className="w-full font-medium font-mono uppercase tracking-widest"
            color="blue"
            disabled={isOpen}
            onClick={() => openModal()}
            size="lg"
          >
            {type === 'register' ? (
              <Trans>Connect or sign in to register</Trans>
            ) : (
              <Trans>Connect or sign in to renew</Trans>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
