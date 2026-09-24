import { Trans } from '@lingui/react/macro'
import { useState } from 'react'
import { getPaymentMethodVisibility } from '../lib/paymentMethodVisibility'

export type PaymentMethodListItem = {
  readonly id: string
  readonly isAvailable: boolean
  readonly isFunded: boolean
  readonly isCommon: boolean
  readonly content: React.ReactNode
}

export const PaymentMethodList = ({
  items,
  defaultExpanded = false,
}: {
  readonly items: readonly PaymentMethodListItem[]
  readonly defaultExpanded?: boolean
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const { visibleMethods, hiddenCount } = getPaymentMethodVisibility(
    items,
    isExpanded,
  )

  return (
    <div className="flex w-full flex-col self-center sm:w-[454px] sm:max-w-full">
      <ul
        aria-label="Payment methods"
        className="flex w-full list-none flex-col gap-3 p-0 sm:gap-0"
      >
        {visibleMethods.map((item) => (
          <li key={item.id}>{item.content}</li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button
          aria-expanded={isExpanded}
          className="mt-3 self-center rounded px-3 py-2 font-medium text-[#191919] text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ens-blue"
          onClick={() => setIsExpanded(true)}
          type="button"
        >
          <Trans>Load {hiddenCount} more</Trans>
        </button>
      )}
    </div>
  )
}
