import type { ReactNode } from 'react'

export const PaymentMethodIcon = ({
  icon,
  networkBadge,
}: {
  readonly icon: ReactNode
  readonly networkBadge?: ReactNode
}) => (
  // Desktop token art is exactly 34px in the approved design.
  <span className="relative block size-7 shrink-0 sm:size-[34px]">
    <span className="block size-full">{icon}</span>
    {networkBadge && (
      <span className="absolute right-0 bottom-0 flex size-3 items-center justify-center overflow-hidden rounded-full ring-1 ring-white sm:size-4">
        {networkBadge}
      </span>
    )}
  </span>
)
