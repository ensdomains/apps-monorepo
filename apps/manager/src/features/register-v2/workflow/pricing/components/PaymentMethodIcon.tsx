import ethIcon from '@/assets/coins/eth-icon.svg'
import { USDCIcon } from '@/components/atoms/StableCoinsIcons'
import { STABLECOINS } from '@/features/shared/registration/nameUtils'

type PaymentMethodIconProps = {
  readonly symbol: string
}

/**
 * The payment asset with its Ethereum-network badge, matching the composite
 * icon used by the WEB-1234 payment-method rows in Figma.
 */
export const PaymentMethodIcon = ({ symbol }: PaymentMethodIconProps) => {
  const coinConfig = STABLECOINS[symbol as keyof typeof STABLECOINS]
  const IconComponent = coinConfig?.icon ?? USDCIcon

  return (
    <span
      className="relative size-7 shrink-0 sm:size-10"
      data-slot="payment-method-token-icon"
    >
      <IconComponent className="size-7 sm:size-10" />
      <img
        alt=""
        aria-hidden="true"
        className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-white sm:size-4"
        data-slot="payment-method-network-icon"
        src={ethIcon}
      />
    </span>
  )
}
