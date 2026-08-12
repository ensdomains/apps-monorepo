import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { TimelineDisclosure } from './TimelineDisclosure'

type TimelineRowProps = {
  readonly isOpen?: boolean
  readonly hoverHighlight?: boolean
  readonly onToggle?: () => void
  readonly className?: string
  readonly children: ReactNode
  readonly disclosure?: ReactNode
}

/** Skip toggle when the click landed on a nested link/button/chip action. */
const isInteractiveTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  target.closest('a,button,[data-stop-toggle]') !== null

export const TimelineRow = ({
  isOpen = false,
  hoverHighlight = true,
  onToggle,
  className,
  children,
  disclosure,
}: TimelineRowProps) => {
  const hasDisclosure = disclosure != null

  const handleClick = (event: MouseEvent) => {
    if (isInteractiveTarget(event.target)) return
    onToggle?.()
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onToggle?.()
    }
  }

  return (
    <div className="flex flex-col">
      {/* biome-ignore lint/a11y/useSemanticElements: cannot use <button> — row contains nested links/chips. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={hasDisclosure ? isOpen : undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          'group/row cursor-pointer select-none rounded-md transition-none pr-3',
          hoverHighlight && 'hover:bg-neutral-1',
          className,
        )}
      >
        {children}
      </div>

      {hasDisclosure && (
        <TimelineDisclosure isOpen={isOpen}>{disclosure}</TimelineDisclosure>
      )}
    </div>
  )
}
