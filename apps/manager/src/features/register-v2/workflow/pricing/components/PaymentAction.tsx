import { Trans } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/** The modal warning, the payment CTA ("Try again" when `onRetry` is set), an optional Cancel, and "What will I sign?". */
export const PaymentAction = ({
  label,
  warning,
  onNext,
  onRetry,
  onCancel,
  canNext,
  isBusy,
  isSettling,
  helpMessage,
}: {
  readonly label: ReactNode
  readonly warning: ReactNode
  readonly onNext: () => void
  readonly onRetry: (() => void) | undefined
  readonly onCancel?: () => void
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
          isEnabled
            ? 'bg-ens-lapis-500 text-white hover:bg-ens-blue-hover'
            : 'bg-ens-quartz-100 text-ens-quartz-400',
          'disabled:cursor-not-allowed disabled:opacity-100',
        )}
        disabled={!isEnabled}
        onClick={onRetry ?? onNext}
      >
        {onRetry ? <Trans>Try again</Trans> : label}
      </Button>
      {onCancel && (
        <button
          className="rounded px-2 py-1 text-ens-quartz-500 text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ens-blue"
          onClick={onCancel}
          type="button"
        >
          <Trans>Cancel</Trans>
        </button>
      )}
      {helpMessage && (
        <Popover>
          <PopoverTrigger className="group flex items-center gap-1 rounded px-2 py-1 text-ens-quartz-500 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ens-blue">
            <MSymbol
              aria-hidden="true"
              className="ms-opsz-20 ms-wght-400 text-xs"
              symbol="info"
            />
            <span className="group-hover:underline">
              <Trans>What will I sign?</Trans>
            </span>
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
