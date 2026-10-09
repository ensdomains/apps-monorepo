import { CheckCircle2, RefreshCw, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Neutral heading card at the top of a step (grey, serif title). */
export const StepHeadingCard = ({
  title,
  description,
}: {
  readonly title: string
  readonly description: ReactNode
}) => (
  <div className="rounded-xl bg-neutral-2 p-6 flex flex-col gap-3">
    <h2 className="font-serif text-3xl font-normal leading-none tracking-[-0.02em]">
      {title}
    </h2>
    <div className="text-p">{description}</div>
  </div>
)

/** Green success card (e.g. "DNSSEC enabled", "Ownership verified"). */
export const StepSuccessCard = ({
  title,
  description,
}: {
  readonly title: string
  readonly description: ReactNode
}) => (
  <div className="rounded-xl bg-message-success-fill text-message-success-text p-6 flex items-start gap-3">
    <CheckCircle2 className="size-6 shrink-0 mt-0.5" strokeWidth={1.5} />
    <div className="flex flex-col gap-2">
      <h2 className="font-serif text-3xl font-normal leading-none tracking-[-0.02em]">
        {title}
      </h2>
      <div className="text-p">{description}</div>
    </div>
  </div>
)

/** Red warning card (e.g. "Record does not match"). */
export const StepDangerCard = ({
  title,
  description,
}: {
  readonly title: string
  readonly description: ReactNode
}) => (
  <div className="rounded-xl bg-message-danger-fill text-message-danger-text p-6 flex items-start gap-3">
    <TriangleAlert className="size-6 shrink-0 mt-0.5" strokeWidth={1.5} />
    <div className="flex flex-col gap-2">
      <h2 className="font-serif text-3xl font-normal leading-none tracking-[-0.02em]">
        {title}
      </h2>
      <div className="text-p">{description}</div>
    </div>
  </div>
)

/** Inline amber/red status chip for the check rows ("DNSSEC not enabled", "None", "Invalid"). */
export const StatusChip = ({
  tone,
  children,
  className,
}: {
  readonly tone: 'warning' | 'danger' | 'success'
  readonly children: ReactNode
  readonly className?: string
}) => (
  <div
    className={cn(
      'flex items-center gap-2 rounded-sm px-4 py-2 text-entity-base',
      tone === 'warning' && 'bg-message-warning-fill text-message-warning-text',
      tone === 'danger' && 'bg-message-danger-fill text-message-danger-text',
      tone === 'success' && 'bg-message-success-fill text-message-success-text',
      className,
    )}
  >
    {tone !== 'success' && (
      <TriangleAlert className="size-4 shrink-0" strokeWidth={1.5} />
    )}
    {children}
  </div>
)

/**
 * The "Refresh" button next to a DNS check. The setup step shows two of them,
 * so each names the check it re-runs rather than reading as "Refresh, Refresh".
 */
export const RefreshButton = ({
  onClick,
  isRefreshing,
  label,
}: {
  readonly onClick: () => void
  readonly isRefreshing: boolean
  /** Accessible name; the visible text stays "Refresh". */
  readonly label: string
}) => (
  <Button
    onClick={onClick}
    disabled={isRefreshing}
    aria-label={label}
    className="shrink-0"
  >
    <RefreshCw className={cn('size-4', isRefreshing && 'animate-spin')} />
    Refresh
  </Button>
)

/** Back / primary-action button row at the bottom of a step. */
export const StepActions = ({
  onBack,
  primary,
}: {
  readonly onBack: () => void
  readonly primary: {
    readonly label: string
    readonly onClick: () => void
    readonly disabled?: boolean
    readonly tone?: 'default' | 'danger'
  }
}) => (
  <div className="flex gap-3">
    <Button variant="outline" className="flex-1" onClick={onBack}>
      Back
    </Button>
    <Button
      className={cn(
        'flex-2',
        primary.tone === 'danger' &&
          'bg-message-danger-fill text-message-danger-text hover:bg-message-danger-fill/80',
      )}
      onClick={primary.onClick}
      disabled={primary.disabled}
    >
      {primary.label}
    </Button>
  </div>
)
