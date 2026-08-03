import type { ReactNode } from 'react'

/**
 * Presentational contract for a single timeline row.
 *
 * The row is a thin interactive wrapper (click-anywhere toggle, instant hover, and the
 * two-phase disclosure). It is layout-agnostic: callers pass the full row content as
 * `children` and the nested content as `disclosure`, so each tier (summary vs event)
 * owns its own grid/indentation — see `features/history`.
 */
export type TimelineRowProps = {
  /** Whether the disclosure is open. */
  readonly isOpen?: boolean
  /** When false the row is static (no toggle, no hover affordance). */
  readonly isInteractive?: boolean
  readonly hoverHighlight?: boolean
  readonly onToggle?: () => void
  readonly className?: string
  /** The full row content (the caller owns its layout/grid). */
  readonly children: ReactNode
  /** Nested content revealed via the two-phase disclosure when `isOpen`. */
  readonly disclosure?: ReactNode
}
