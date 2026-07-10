import { Trans } from '@lingui/react/macro'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NamesBreakdown } from './NamesBreakdown'
import type { RowStatus, SummaryRow } from './types'

// Bead grid geometry: ~4 rows in an 18px-tall bar → 4.5px vertical cell.
const H_CELL = 5
const V_CELL = 4.5

/**
 * The continuous colour field, before it's masked into beads: light-blue tiles
 * on top, pink on the bottom, with a solid colour column every ~3rd cell. Blue
 * is the default column; magenta / green / black land on every 5th / 7th / 11th
 * column (drawn on top so they replace the blue there).
 */
const COLOR_FIELD = [
  'repeating-linear-gradient(90deg, transparent 0 160px, var(--color-ens-quartz-900) 160px 165px)', // black (every 11th)
  'repeating-linear-gradient(90deg, transparent 0 100px, var(--color-ens-peridot-core) 100px 105px)', // green (every 7th)
  'repeating-linear-gradient(90deg, transparent 0 70px, var(--color-ens-magenta) 70px 75px)', // magenta (every 5th)
  'repeating-linear-gradient(90deg, transparent 0 10px, var(--color-ens-lapis-core) 10px 15px)', // blue (every 3rd)
  'linear-gradient(to bottom, color-mix(in srgb, var(--color-ens-lapis-300), var(--color-ens-lapis-core) 18%) 0 55%, color-mix(in srgb, var(--color-ens-garnet-200), var(--color-ens-garnet-core) 18%) 55%)', // tile base (light tones nudged darker)
].join(', ')

// Rounded-square bead mask: a 5×4.5 tile holds a rounded rect (the bead); the
// transparent margin around it becomes the white gap between beads.
const BEAD_MASK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='5' height='4.5'%3E%3Crect x='0.6' y='0.55' width='3.8' height='3.4' rx='1' fill='%23000'/%3E%3C/svg%3E\")"

const ProgressBar = ({ progress }: { readonly progress: number }) => (
  <div className="h-[18px] w-full overflow-hidden bg-ens-quartz-150">
    <div
      className="relative h-full bg-ens-quartz-0 transition-[width] duration-500 ease-out"
      style={{ width: `${Math.min(100, Math.max(4, progress))}%` }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: COLOR_FIELD,
          maskImage: BEAD_MASK,
          maskSize: `${H_CELL}px ${V_CELL}px`,
          WebkitMaskImage: BEAD_MASK,
          WebkitMaskSize: `${H_CELL}px ${V_CELL}px`,
        }}
      />
    </div>
  </div>
)

/** In-progress view: striped header bar + the names breakdown + busy button. */
export const RenewingStep = ({
  rows,
  total,
  statuses,
  simulate = false,
}: {
  readonly rows: readonly SummaryRow[]
  readonly total: number
  readonly statuses: Readonly<Record<string, RowStatus>>
  /** TEMP: loop the progress bar forever to preview the design. */
  readonly simulate?: boolean
}) => {
  const [simProgress, setSimProgress] = useState(0)
  useEffect(() => {
    if (!simulate) return
    const id = setInterval(
      () => setSimProgress((p) => (p >= 100 ? 0 : p + 3)),
      150,
    )
    return () => clearInterval(id)
  }, [simulate])

  const count = rows.length
  const doneCount = rows.filter((row) => statuses[row.label] === 'done').length
  const activeCount = rows.filter(
    (row) => statuses[row.label] === 'active',
  ).length
  const progress = simulate
    ? simProgress
    : count > 0
      ? ((doneCount + activeCount * 0.5) / count) * 100
      : 0

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3 pr-8">
          <DialogTitle className="shrink-0 font-normal font-sans text-base text-ens-lapis-core">
            <Trans>Renewing names</Trans>
          </DialogTitle>
          <ProgressBar progress={progress} />
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
