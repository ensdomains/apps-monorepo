import { Trans } from '@lingui/react/macro'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NamesBreakdown } from './NamesBreakdown'
import type { SummaryRow } from './types'

const dialogTitleClassName =
  'text-left font-normal font-sans text-ens-quartz-900 text-xl tracking-[-0.4px]'

/** Terminal success view: completion banner + receipt + done button. */
export const SuccessStep = ({
  rows,
  total,
  onDone,
}: {
  readonly rows: readonly SummaryRow[]
  readonly total: number
  readonly onDone: () => void
}) => (
  <>
    <DialogHeader>
      <DialogTitle className={dialogTitleClassName}>
        <Trans>Renewal complete</Trans>
      </DialogTitle>
    </DialogHeader>

    <div className="flex items-start gap-3 rounded-lg border border-ens-peridot-border bg-ens-peridot-bg p-4">
      <CheckCircle2
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-ens-peridot-text-dark"
      />
      <div className="flex flex-col gap-1">
        <p className="font-medium font-sans text-ens-peridot-text-dark text-sm">
          <Trans>Renewal complete!</Trans>
        </p>
        <p className="font-sans text-ens-peridot-text-medium text-sm">
          <Trans>Your names have been successfully renewed.</Trans>
        </p>
      </div>
    </div>

    <NamesBreakdown rows={rows} total={total} />

    <Button
      className="w-full uppercase"
      onClick={onDone}
      size="lg"
      type="button"
      variant="lightBlue"
    >
      <Trans>Done</Trans>
    </Button>
  </>
)
