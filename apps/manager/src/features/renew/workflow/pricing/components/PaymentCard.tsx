import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { zeroAddress } from 'viem'
import { useBaseRate } from '@/features/register-v2/data/queries/baseRates.query'
import { getPricingQueryOptions } from '@/features/register-v2/data/queries/pricing.query'
import { calculateDiscount } from '@/features/register-v2/utils/discount'
import { PaymentCardBase } from '@/features/register-v2/workflow/pricing/components/PaymentCard'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'

export const PaymentCard = () => {
  const { uiActor, label } = useRenewalUiContext()

  const [duration, canNext] = useSelector(uiActor, (state) => [
    state.context.duration,
    state.can({ type: 'pricing.step.next' }),
  ])

  const baseRate = useBaseRate(label)

  const pricingQuery = useQuery({
    ...getPricingQueryOptions(label, zeroAddress, duration, TOKENS.USDC.symbol),
    select: (data) => ({
      totalPrice: decimalBigintToNumber(data.totalPrice, TOKENS.USDC.decimals),
      basePrice: decimalBigintToNumber(data.basePrice, TOKENS.USDC.decimals),
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
      canNext={canNext}
      discountAmount={discountAmount}
      isLoading={pricingQuery.isLoading || pricingQuery.isPlaceholderData}
      onNext={() => uiActor.send({ type: 'pricing.step.next' })}
      type="renew"
    />
  )
}
