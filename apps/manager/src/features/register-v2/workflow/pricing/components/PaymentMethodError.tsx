import type { ReactNode } from 'react'
import { MSymbol } from '@/components/ui/material-symbol'

export const PaymentMethodError = ({
  children,
  id,
}: {
  readonly children: ReactNode
  readonly id: string
}) => (
  <span
    className="col-span-2 col-start-1 flex items-center gap-0.5 justify-self-stretch whitespace-nowrap pl-9 text-left text-[10px] text-ens-signal-danger-500 leading-[normal] sm:pl-[46px] sm:text-xs"
    data-slot="payment-method-error"
    id={id}
  >
    <MSymbol
      aria-hidden="true"
      className="ms-opsz-12 ms-wght-400 inline-block shrink-0"
      symbol="flash_off"
    />
    <span data-slot="payment-method-error-message">{children}</span>
  </span>
)
