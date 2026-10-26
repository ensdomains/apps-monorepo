import { Trans } from '@lingui/react/macro'
import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { match } from 'ts-pattern'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PaymentHelp } from './PaymentHelp'

/** The payment CTA, which becomes "Try again" when `onRetry` is set, with the help disclosure below. */
export const PaymentAction = ({
  label,
  onNext,
  onRetry,
  canNext,
  isBusy,
  isSettling,
  helpMessage,
}: {
  readonly label: ReactNode
  readonly onNext: () => void
  readonly onRetry: (() => void) | undefined
  readonly canNext: boolean
  readonly isBusy: boolean
  readonly isSettling: boolean
  readonly helpMessage: ReactNode
}) => {
  const isEnabled = !isBusy && (canNext || !!onRetry)
  const stateClasses = match({ isBusy, isEnabled })
    .with(
      { isBusy: true },
      () =>
        'bg-ens-blue text-white hover:bg-ens-blue-hover disabled:opacity-100',
    )
    .with(
      { isEnabled: true },
      () => 'bg-ens-blue text-white hover:bg-ens-blue-hover',
    )
    .otherwise(() => undefined)

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <Button
        aria-busy={isSettling}
        className={cn(
          'h-14 w-full rounded bg-ens-gray-two font-medium font-mono text-ens-gray-dark text-sm uppercase tracking-wider',
          'hover:bg-ens-gray-two',
          'disabled:cursor-not-allowed disabled:opacity-50',
          stateClasses,
        )}
        disabled={!isEnabled}
        onClick={onRetry ?? onNext}
      >
        {isSettling && (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        )}
        {onRetry ? <Trans>Try again</Trans> : label}
      </Button>
      {helpMessage && <PaymentHelp>{helpMessage}</PaymentHelp>}
    </div>
  )
}
