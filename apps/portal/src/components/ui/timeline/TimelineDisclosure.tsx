import { type ReactNode, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface TimelineDisclosureProps {
  readonly isOpen: boolean
  readonly children: ReactNode
  readonly className?: string
}

/**
 * Expand/collapse nested timeline content: grow height, then fade in.
 * Stays overflow-hidden while animating; overflow-visible when settled so
 * EntityBadge hover chips aren't clipped.
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
