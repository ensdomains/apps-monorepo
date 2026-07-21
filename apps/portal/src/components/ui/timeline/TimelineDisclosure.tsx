import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TimelineDisclosureProps {
  readonly isOpen: boolean
  readonly children: ReactNode
  readonly className?: string
}

/**
 * Two-phase reveal, per the History timeline design notes:
 *   1. Expand the whitespace to the height the new rows need — `grid-template-rows`
 *      0fr → 1fr over 150ms. (Animating grid rows avoids measuring `height:auto`.)
 *   2. THEN fade the content in — opacity over 100ms, delayed 150ms so it only
 *      begins once the space exists.
 *
 * "Create the space we need, then fill it." We never wipe across or animate text;
 * each level arrives as a block. Close reverses: content fades (no delay) while the
 * height collapses.
 */
export const TimelineDisclosure = ({
  isOpen,
  children,
  className,
}: TimelineDisclosureProps) => (
  <div
    className={cn(
      'grid transition-[grid-template-rows] duration-150 ease-out',
      isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      className,
    )}
  >
    <div className="min-h-0 overflow-hidden">
      <div
        className={cn(
          'transition-opacity duration-100',
          isOpen ? 'opacity-100 delay-150' : 'opacity-0',
        )}
      >
        {children}
      </div>
    </div>
  </div>
)
