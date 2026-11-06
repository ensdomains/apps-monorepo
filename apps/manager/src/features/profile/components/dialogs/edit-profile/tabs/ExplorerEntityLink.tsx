import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface ExplorerEntityLinkProps {
  readonly actions: ReactNode
  readonly actionsLabel: string
  readonly children: ReactNode
  readonly className: string
  readonly href: string
}

/** Direct navigation stays available on touch; actions also appear on keyboard focus. */
export const ExplorerEntityLink = ({
  actions,
  actionsLabel,
  children,
  className,
  href,
}: ExplorerEntityLinkProps) => {
  const linkRef = useRef<HTMLAnchorElement>(null)
  const [isDismissed, setIsDismissed] = useState(false)

  return (
    <fieldset
      aria-label={actionsLabel}
      className="group/explorer-entity relative inline-flex min-w-0 max-w-full align-middle"
      onFocus={() => setIsDismissed(false)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || isDismissed) return
        event.preventDefault()
        event.stopPropagation()
        linkRef.current?.focus()
        setIsDismissed(true)
      }}
      onMouseEnter={() => setIsDismissed(false)}
    >
      <a
        className={cn(
          'inline-flex max-w-full items-center gap-1.5 rounded-sm px-1.5 py-1 font-medium transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none',
          className,
        )}
        href={href}
        ref={linkRef}
        rel="noopener noreferrer"
        target="_blank"
      >
        {children}
      </a>
      <span
        className="invisible absolute bottom-full left-0 z-10 flex gap-1 pb-1 opacity-0 transition-opacity group-focus-within/explorer-entity:visible group-focus-within/explorer-entity:opacity-100 group-hover/explorer-entity:visible group-hover/explorer-entity:opacity-100 motion-reduce:transition-none"
        hidden={isDismissed}
      >
        {actions}
      </span>
    </fieldset>
  )
}
