import { ChevronDown } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { TimelineRow } from '@/components/ui/timeline'
import { cn } from '@/lib/utils'

/**
 * Nested timeline row (tx header / event): chevron outside the content column so
 * wrapped mobile lines align under the text, not the icon.
 */
export const ExpandableDetailRow = ({
  left,
  right,
  disclosure,
}: {
  readonly left: ReactNode
  readonly right?: ReactNode
  readonly disclosure: ReactNode
}) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <TimelineRow
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      className="ml-(--tier2-indent) pl-2 hover:bg-transparent"
      disclosure={<div className="py-1 pl-(--detail-indent)">{disclosure}</div>}
    >
      <div className="flex items-start gap-2 py-2 pr-3">
        <span className="inline-flex shrink-0 items-center justify-center rounded-md bg-neutral-1 p-1 text-neutral-5">
          <ChevronDown
            className={cn(
              'size-5.25 stroke-[1.25] transition-transform duration-150',
              isOpen && 'rotate-180 text-neutral-7',
            )}
            aria-hidden
          />
        </span>
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-3 sm:gap-y-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {left}
          </div>
          {right != null && (
            <div className="justify-self-start whitespace-nowrap sm:justify-self-end">
              {right}
            </div>
          )}
        </div>
      </div>
    </TimelineRow>
  )
}
