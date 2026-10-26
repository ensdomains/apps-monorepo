import { Trans } from '@lingui/react/macro'
import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

/** The payment CTA, "Try again" when `onRetry` is set, with "What will I sign?" below. */
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

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <Button
        aria-busy={isSettling}
        className={cn(
          'h-14 w-full rounded bg-ens-blue font-medium font-mono text-sm text-white uppercase tracking-wider hover:bg-ens-blue-hover',
          'disabled:cursor-not-allowed disabled:opacity-50',
          isBusy && 'disabled:opacity-100',
        )}
        disabled={!isEnabled}
        onClick={onRetry ?? onNext}
      >
        {isSettling && (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        )}
        {onRetry ? <Trans>Try again</Trans> : label}
      </Button>
      {helpMessage && (
        <Collapsible className="flex w-full flex-col items-center gap-3">
          <CollapsibleTrigger className="rounded px-2 py-1 text-ens-quartz-500 text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ens-blue">
            <Trans>What will I sign?</Trans>
          </CollapsibleTrigger>
          <CollapsibleContent className="w-full rounded-xl bg-ens-quartz-50 p-4 text-left text-ens-quartz-500 text-sm">
            {helpMessage}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}
