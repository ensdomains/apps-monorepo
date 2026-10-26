import { Trans } from '@lingui/react/macro'
import { useState } from 'react'
import { getPaymentMethodVisibility } from '../lib/paymentMethodVisibility'

export type PaymentMethodListItem = {
  readonly id: string
  readonly isSelected: boolean
  readonly content: React.ReactNode
}

export const PaymentMethodList = ({
  items,
}: {
  readonly items: readonly PaymentMethodListItem[]
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const { visibleMethods } = getPaymentMethodVisibility(items, isExpanded)
  const { hiddenCount } = getPaymentMethodVisibility(items, false)

  return (
    <div
      className={
        // Figma specifies a 454px desktop list width; no exact theme token exists.
        'flex w-full flex-col self-center sm:w-[454px] sm:max-w-full'
      }
    >
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
          className="mt-3 self-center rounded px-3 py-2 font-medium text-ens-quartz-900 text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ens-blue focus-visible:ring-offset-2"
          onClick={() => setIsExpanded(!isExpanded)}
          type="button"
        >
          {isExpanded ? (
            <Trans>Show fewer</Trans>
          ) : (
            <Trans>Show {hiddenCount} more</Trans>
          )}
        </button>
      )}
    </div>
  )
}
