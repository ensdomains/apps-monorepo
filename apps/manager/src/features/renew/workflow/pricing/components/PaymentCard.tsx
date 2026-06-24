import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { useBaseRate } from '@/features/register-v2/data/queries/baseRates.query'
import { getRenewPriceQueryOptions } from '@/features/register-v2/data/queries/pricing.query'
import { calculateDiscount } from '@/features/register-v2/utils/discount'
import { PaymentCardBase } from '@/features/register-v2/workflow/pricing/components/PaymentCard'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'
import { useSmartSessionGate } from '@/features/wallet/hooks/useSmartSessionGate'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'

export const PaymentCard = () => {
  const { uiActor, label } = useRenewalUiContext()

  const [duration, canNext] = useSelector(uiActor, (state) => [
    state.context.duration,
    state.can({ type: 'pricing.step.next' }),
  ])

  // Same front-of-flow smart-session gate as registration: prompt to enable a
  // session before opening the stablecoin chooser, not over it.
  const { gate, sessionModal } = useSmartSessionGate()

  const baseRate = useBaseRate(label)

  const pricingQuery = useQuery({
    ...getRenewPriceQueryOptions(label, duration, TOKENS.USDC.symbol),
    select: (data) => decimalBigintToNumber(data.amount, TOKENS.USDC.decimals),
    placeholderData: keepPreviousData,
  })

  const { discountAmount } = calculateDiscount(
    pricingQuery.data ?? 0,
    baseRate,
    BigInt(duration),
  )

  const openTokenPicker = () => uiActor.send({ type: 'pricing.step.next' })

  return (
    <>
      <PaymentCardBase
        amount={pricingQuery.data}
        canNext={canNext}
        discountAmount={discountAmount}
        isLoading={pricingQuery.isLoading || pricingQuery.isPlaceholderData}
        onNext={() => gate(openTokenPicker)}
        type="renew"
      />
      {sessionModal}
    </>
  )
}
