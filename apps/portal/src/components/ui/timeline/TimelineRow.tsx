import type { KeyboardEvent, MouseEvent } from 'react'
import { cn } from '@/lib/utils'
import { TimelineDisclosure } from './TimelineDisclosure'
import type { TimelineRowProps } from './timeline.types'

/**
 * A click on an entity chip / copy button / link should perform its own action, not
 * toggle the row. The row is a `div[role=button]`, so `closest('a,button')` never
 * matches the row itself — only genuinely interactive descendants.
 */
const isInteractiveTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  target.closest('a,button,[data-stop-toggle]') !== null

export const TimelineRow = ({
  isOpen = false,
  isInteractive = true,
  onToggle,
  className,
  children,
  disclosure,
}: TimelineRowProps) => {
  const hasDisclosure = disclosure != null

  const handleClick = (event: MouseEvent) => {
    if (!isInteractive || isInteractiveTarget(event.target)) return
    onToggle?.()
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!isInteractive) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onToggle?.()
    }
  }

  return (
    <div className="flex flex-col">
      {isInteractive ? (
        // biome-ignore lint/a11y/useSemanticElements: a real <button> cannot wrap the interactive entity chips/links this row contains; div[role=button] is intentional (click-anywhere row).
        <div
          role="button"
          tabIndex={0}
          aria-expanded={hasDisclosure ? isOpen : undefined}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className={cn(
            'group/row cursor-pointer select-none rounded-md transition-none hover:bg-muted/60',
            className,
          )}
        >
          {children}
        </div>
      ) : (
        <div className={cn('rounded-md', className)}>{children}</div>
      )}

      {hasDisclosure && (
        <TimelineDisclosure isOpen={isOpen}>{disclosure}</TimelineDisclosure>
      )}
    </div>
  )
}
