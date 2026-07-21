import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TimelineProps {
  readonly children: ReactNode
  readonly className?: string
}

/**
 * Container for a vertical timeline of {@link TimelineRow}s. Presentational only —
 * it establishes the column; rows own their own rail/indent.
 */
export const Timeline = ({ children, className }: TimelineProps) => (
  <div className={cn('flex flex-col', className)}>{children}</div>
)
