import { type ReactNode, useState } from 'react'
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
export const TimelineDisclosure = ({
  isOpen,
  children,
  className,
}: TimelineDisclosureProps) => {
  const [isSettled, setIsSettled] = useState(isOpen)
  if (!isOpen && isSettled) setIsSettled(false)

  const [hasOpened, setHasOpened] = useState(isOpen)
  if (isOpen && !hasOpened) setHasOpened(true)

  return (
    <div
      onTransitionEnd={(e) => {
        if (
          e.target === e.currentTarget &&
          e.propertyName === 'grid-template-rows' &&
          isOpen
        ) {
          setIsSettled(true)
        }
      }}
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
          {hasOpened ? children : null}
        </div>
      </div>
    </div>
  )
}
