import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { Trans } from '@lingui/react/macro'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { useState } from 'react'
import type { Address } from 'viem'
import { DAI, USDCIcon, USDTIcon } from '@/components/atoms/StableCoinsIcons'
import { Button } from '@/components/ens-consumer/button/Button'
import { useBaseRate } from '@/features/register-v2/data/queries/baseRates.query'
import { calculateDiscount } from '@/features/register-v2/utils/discount'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { isFeatureEnabled } from '@/utils/feature-flags'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { tw } from '@/utils/tailwind'
import { getRegisterPriceQueryOptions } from '../../../data/queries/pricing.query'
import { useRegistrationV2Context } from '../../../state/registrationUi.context'
import { AnimatedPrice } from './AnimatedPrice'
import { CrossmintCheckoutDialog } from './CrossmintCheckoutDialog'
import {
  PaymentCardBaseLine,
  PaymentCardPremiumLine,
} from './PaymentCardLineItems'

// Crossmint's default per-transaction credit-card limit (USD). Above this the
// card option is disabled with a warning (per WEB-7).
const CARD_LIMIT_USD = 1500

export const PaymentCard = () => {
  const { uiActor, label } = useRegistrationV2Context()
  const [duration, canNext] = useSelector(uiActor, (state) => [
    state.context.duration,
    state.can({ type: 'pricing.step.next' }),
  ])
  const { ownerAddress } = useSmartAccountContext()
  const [cardOpen, setCardOpen] = useState(false)

  const baseRate = useBaseRate(label)

  const pricingQuery = useQuery({
    ...getRegisterPriceQueryOptions(label, duration, TOKENS.USDC.symbol),
    select: (data) => ({
      totalPrice: decimalBigintToNumber(
        data.basePrice + data.premium,
        TOKENS.USDC.decimals,
      ),
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

  const totalPriceUsd = pricingQuery.data?.totalPrice
  const cardCheckoutEnabled = isFeatureEnabled('CARD_CHECKOUT')
  const overCardLimit =
    totalPriceUsd !== undefined && totalPriceUsd > CARD_LIMIT_USD
  const showCardOption = cardCheckoutEnabled && Boolean(ownerAddress)

  return (
    <>
      <PaymentCardBase
        amount={totalPriceUsd}
        basePrice={pricingQuery.data?.basePrice}
        canNext={canNext}
        cardOverLimit={overCardLimit}
        discountAmount={discountAmount}
        isLoading={pricingQuery.isLoading || pricingQuery.isPlaceholderData}
        onNext={() => uiActor.send({ type: 'pricing.step.next' })}
        onPayWithCard={showCardOption ? () => setCardOpen(true) : undefined}
        premiumAmount={pricingQuery.data?.premiumPrice}
        type="register"
      />
      {showCardOption && ownerAddress && (
        <CrossmintCheckoutDialog
          durationSeconds={duration}
          label={label}
          onOpenChange={setCardOpen}
          open={cardOpen}
          ownerAddress={ownerAddress as Address}
          totalPriceUsd={totalPriceUsd}
        />
      )}
    </>
  )
}

export const PaymentCardBase = ({
  canNext,
  onNext,
  onPayWithCard,
  cardOverLimit,
  amount,
  isLoading,
  discountAmount,
  premiumAmount,
  basePrice,
  type,
}: {
  canNext: boolean
  onNext: () => void
  /** When set, renders a "Pay with card" option (registration only). */
  onPayWithCard?: () => void
  /** Disables the card option + shows a warning when over the card limit. */
  cardOverLimit?: boolean
  amount: number | undefined
  discountAmount?: number
  premiumAmount?: number
  /** Base registration cost (excludes the one-time cooldown premium). */
  basePrice?: number
  isLoading: boolean
  type: 'register' | 'renew'
}) => {
  const { isConnected } = useSmartAccountContext()
  const { openConnectModal, connectModalOpen } = useConnectModal()

  return (
    <div
      className={tw(
        'flex flex-1 flex-col items-center justify-between gap-8',
        'rounded-xl border-[#DDDDDE] border-[0.5px] bg-white px-12 py-6 shadow-temp-card',
      )}
    >
      <div className="w-full max-w-55 space-y-3 text-center">
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
            <AnimatedPrice emphasis="soft" value={amount ?? 0} />
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
              Save <AnimatedPrice value={discountAmount ?? 0} />
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
          <>
            <Button
              className="w-full font-medium font-mono uppercase tracking-widest"
              color="blue"
              disabled={!canNext}
              onClick={onNext}
              size="lg"
            >
              <Trans>Pay with stablecoins</Trans>
            </Button>
            {onPayWithCard && (
              <>
                <Button
                  className="w-full font-medium font-mono uppercase tracking-widest"
                  color="lightBlue"
                  disabled={!canNext || cardOverLimit}
                  onClick={onPayWithCard}
                  size="lg"
                >
                  <Trans>Pay with card</Trans>
                </Button>
                {cardOverLimit && (
                  <p className="text-center text-ens-signal-error-core text-xs">
                    <Trans>
                      Card payments are limited to $1,500. Pay with stablecoins
                      for this amount.
                    </Trans>
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          <Button
            className="w-full font-medium font-mono uppercase tracking-widest"
            color="blue"
            disabled={connectModalOpen}
            onClick={() => openConnectModal?.()}
            size="lg"
          >
            {type === 'register' ? (
              <Trans>Connect to register</Trans>
            ) : (
              <Trans>Connect to renew</Trans>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
