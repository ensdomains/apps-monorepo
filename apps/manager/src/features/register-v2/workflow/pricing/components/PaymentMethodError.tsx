import { MSymbol } from '@/components/ui/material-symbol'

export const PaymentMethodError = ({
  id,
  children,
}: {
  readonly id?: string
  readonly children: React.ReactNode
}) => (
  <span
    className={
      // Figma specifies 10px mobile error copy; Tailwind has no exact text token.
      'flex min-w-0 items-center gap-1 whitespace-nowrap text-[10px] text-ens-signal-danger-500 leading-none sm:text-xs'
    }
    id={id}
  >
    <MSymbol
      aria-hidden="true"
      className="ms-opsz-16 ms-wght-400 shrink-0"
      symbol="flash_off"
    />
    <span>{children}</span>
  </span>
)
