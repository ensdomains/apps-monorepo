import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { useModal } from '@getpara/react-sdk-lite'
import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { zeroAddress } from 'viem'
import { Button } from '@/components/ui/button'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { tw } from '@/utils/tailwind'
import { getPricingQueryOptions } from '../../../data/queries/pricing.query'
import { useRegistrationV2Context } from '../../../state/registrationUi.context'

export const PaymentCard = () => {
  const { uiActor, label } = useRegistrationV2Context()
  const { ownerAddress } = useSmartAccountContext()

  const [duration, canNext] = useSelector(uiActor, (state) => [
    state.context.duration,
    state.can({ type: 'pricing.step.next' }),
  ])

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

  return (
    <PaymentCardBase
      amount={pricingQuery.data}
      canNext={canNext}
      onNext={() => uiActor.send({ type: 'pricing.step.next' })}
      type="register"
    />
  )
}

export const PaymentCardBase = ({
  canNext,
  onNext,
  amount,
  type,
}: {
  canNext: boolean
  onNext: () => void
  amount: number | undefined
  type: 'register' | 'renew'
}) => {
  const { isConnected } = useSmartAccountContext()
  const { openModal, isOpen } = useModal()

  return (
    <div
      className={tw(
        'flex flex-1 flex-col items-center justify-between gap-8',
        'rounded-xl border border-[#DDDDDE] bg-white p-8',
      )}
    >
      <div className="space-y-3 text-center">
        <p className="text-ens-lapis-surface text-xs uppercase">
          <Trans>Total</Trans>
        </p>
        <div className="flex items-end gap-1.5">
          <span className="font-medium text-4xl text-ens-blue-midnight leading-ens-none md:text-5xl">
            {amount ? (
              formatUsd(amount)
            ) : (
              <span className="animate-pulse">$...</span>
            )}
          </span>
          <span className="font-normal text-base text-ens-blue-midnight leading-7">
            <Trans>USD</Trans>
          </span>
        </div>
      </div>

      {isConnected ? (
        <Button
          className="w-full uppercase"
          disabled={!canNext}
          onClick={onNext}
          size="xl"
          variant="blue"
        >
          <Trans>Pay with stablecoins</Trans>
        </Button>
      ) : (
        <Button
          className="w-full uppercase"
          disabled={isOpen}
          onClick={() => openModal()}
          size="xl"
          variant="blue"
        >
          {type === 'register' ? (
            <Trans>Connect or sign in to register</Trans>
          ) : (
            <Trans>Connect or sign in to renew</Trans>
          )}
        </Button>
      )}
    </div>
  )
}
