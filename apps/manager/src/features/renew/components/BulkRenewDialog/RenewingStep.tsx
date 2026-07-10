import { Trans } from '@lingui/react/macro'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NamesBreakdown } from './NamesBreakdown'
import type { RowStatus, SummaryRow } from './types'

/** Candy-striped (blue/magenta) progress track shown while renewals run. */
const StripedProgressBar = ({ progress }: { readonly progress: number }) => (
  <div className="h-2.5 w-full overflow-hidden rounded-full bg-ens-quartz-150">
    <div
      className="h-full rounded-full transition-[width] duration-500 ease-out"
      style={{
        width: `${Math.min(100, Math.max(6, progress))}%`,
        backgroundImage:
          'repeating-linear-gradient(90deg, var(--color-ens-lapis-core) 0px, var(--color-ens-lapis-core) 5px, var(--color-ens-magenta) 5px, var(--color-ens-magenta) 10px)',
      }}
    />
  </div>
)

/** In-progress view: striped header bar + the names breakdown + busy button. */
export const RenewingStep = ({
  rows,
  total,
  statuses,
}: {
  readonly rows: readonly SummaryRow[]
  readonly total: number
  readonly statuses: Readonly<Record<string, RowStatus>>
}) => {
  const count = rows.length
  const doneCount = rows.filter((row) => statuses[row.label] === 'done').length
  const activeCount = rows.filter(
    (row) => statuses[row.label] === 'active',
  ).length
  const progress =
    count > 0 ? ((doneCount + activeCount * 0.5) / count) * 100 : 0

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3 pr-8">
          <DialogTitle className="shrink-0 font-normal font-sans text-base text-ens-lapis-core">
            <Trans>Renewing names</Trans>
          </DialogTitle>
          <StripedProgressBar progress={progress} />
        </div>
      </DialogHeader>

      <NamesBreakdown rows={rows} total={total} />

      <Button
        className="pointer-events-none w-full uppercase"
        size="lg"
        type="button"
        variant="blue"
      >
        <Trans>Renewing names</Trans>
        <Loader2 aria-hidden className="size-4 animate-spin" />
      </Button>
    </>
  )
}
