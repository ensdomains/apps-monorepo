import { Trans } from '@lingui/react/macro'
import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/** The modal warning, the payment CTA ("Try again" when `onRetry` is set), and "What will I sign?". */
export const PaymentAction = ({
  label,
  warning,
  onNext,
  onRetry,
  canNext,
  isBusy,
  isSettling,
  helpMessage,
}: {
  readonly label: ReactNode
  readonly warning: ReactNode
  readonly onNext: () => void
  readonly onRetry: (() => void) | undefined
  readonly canNext: boolean
  readonly isBusy: boolean
  readonly isSettling: boolean
  readonly helpMessage: ReactNode
}) => {
  const isEnabled = !isBusy && (canNext || !!onRetry)

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {warning && (
        <p
          className="w-full text-center text-ens-signal-danger-800 text-lg"
          role="alert"
        >
          {warning}
        </p>
      )}
      <Button
        aria-busy={isSettling}
        className={cn(
          'h-18 w-full rounded font-medium font-mono text-sm uppercase tracking-[1.12px]',
          isEnabled || isBusy
            ? 'bg-ens-lapis-500 text-white hover:bg-ens-blue-hover'
            : 'bg-ens-quartz-100 text-ens-quartz-400',
          'disabled:cursor-not-allowed disabled:opacity-100',
        )}
        disabled={!isEnabled}
        onClick={onRetry ?? onNext}
      >
        {isBusy && <LoaderCircle aria-hidden="true" className="animate-spin" />}
        {onRetry ? <Trans>Try again</Trans> : label}
      </Button>
      {helpMessage && (
        <Popover>
          <PopoverTrigger className="rounded px-2 py-1 text-ens-quartz-500 text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ens-blue">
            <Trans>What will I sign?</Trans>
          </PopoverTrigger>
          <PopoverContent
            className="w-80 text-ens-quartz-500 text-sm"
            side="top"
          >
            {helpMessage}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
