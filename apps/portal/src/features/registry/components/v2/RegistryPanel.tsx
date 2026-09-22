import type { ReactNode } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

/**
 * The block that sits in the registry tree's deepest slot — the configure form,
 * the reconfigure form, the V1 migrate prompt, the detached-registry notice.
 *
 * They all hang off the same tree row, so they share its indent: nested under
 * the row on desktop, flush with a little breathing room on mobile.
 */
export const RegistryPanel = ({
  children,
}: {
  readonly children: ReactNode
}) => {
  const isMobile = useIsMobile()

  return (
    <div
      className={cn(
        'flex flex-col gap-4 max-w-xl',
        isMobile ? 'pl-0 pt-3' : 'pl-14',
      )}
    >
      {children}
    </div>
  )
}
