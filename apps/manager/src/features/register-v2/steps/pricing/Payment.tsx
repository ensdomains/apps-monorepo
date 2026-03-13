import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { useModal } from '@getpara/react-sdk-lite'
import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { Button } from '@/components/ui/button'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { tw } from '@/utils/tailwind'
import { useRegistrationV2Context } from '../../machines/RegistrationV2UiContext'
import { getPricingQueryOptions } from '../../queries/pricing'

export const Payment = () => {
  const { uiActor, label } = useRegistrationV2Context()
  const { isConnected } = useSmartAccountContext()
  const { openModal, isOpen } = useModal()

  const [duration, isPricing] = useSelector(uiActor, (state) => [
    state.context.duration,
    state.matches('pricing'),
  ])

  const pricingQuery = useQuery({
    ...getPricingQueryOptions(label, duration, TOKENS.USDC.symbol),
    select: (data) =>
      decimalBigintToNumber(data.totalPrice, TOKENS.USDC.decimals),
  })

  return (
    <div
      className={tw(
        'flex flex-1 flex-col items-center justify-between gap-8',
        'rounded-xl border border-[#DDDDDE] bg-white p-8',
      )}
    >
      {/* Total Price Section */}
      <div className="space-y-3 text-center">
        <p className="text-ens-lapis-surface text-xs uppercase">
          <Trans>Total</Trans>
        </p>
        <div className="flex items-end gap-1.5">
          <span className="font-medium text-5xl text-ens-blue-midnight leading-ens-none">
            {formatUsd(pricingQuery.data ?? 0)}
          </span>
          <span className="font-normal text-base text-ens-blue-midnight leading-7">
            USD
          </span>
        </div>
      </div>

      {/* Payment Methods Section */}
      {isConnected ? (
        <Button
          className="w-full uppercase"
          disabled={!isPricing}
          onClick={() => uiActor.send({ type: 'NEXT' })}
          size="xl"
          variant="blue"
        >
          <Trans>Pay with stable coins</Trans>
        </Button>
      ) : (
        <Button
          className="w-full uppercase"
          disabled={isOpen}
          onClick={() => openModal()}
          size="xl"
          variant="blue"
        >
          <Trans>Connect or sign in to register</Trans>
        </Button>
      )}
    </div>
  )
}
