import { type ReactNode, useEffect, useState } from 'react'
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
 * `overflow-hidden` is required to clip the content to the animating height — but only
 * while animating. Once fully open we switch to `overflow-visible` so descendants'
 * hover popovers (EntityBadge chips overflow upward) aren't clipped.
 */
const SETTLE_MS = 300

export const TimelineDisclosure = ({
  isOpen,
  children,
  className,
}: TimelineDisclosureProps) => {
  const [isSettled, setIsSettled] = useState(isOpen)

  useEffect(() => {
    if (!isOpen) {
      setIsSettled(false)
      return
    }
    const timer = setTimeout(() => setIsSettled(true), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [isOpen])

  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows] duration-150 ease-out',
        isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        className,
      )}
    >
      <div
        className={cn(
          'min-h-0',
          isSettled ? 'overflow-visible' : 'overflow-hidden',
        )}
      >
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
}
