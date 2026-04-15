import type { ReactNode } from 'react'
import { ExternalLink } from 'react-external-link'
import { cn } from '@/lib/utils'

export type EntityVariant = 'name' | 'address' | 'contract' | 'tx'

const variantClass: Record<EntityVariant, string> = {
  name: 'bg-entity-fill-name dark:bg-entity-bg text-syntax-name',
  address: 'bg-entity-fill-address dark:bg-entity-bg text-syntax-address',
  contract: 'bg-entity-fill-contract dark:bg-entity-bg text-syntax-contract',
  tx: 'bg-entity-fill-tx dark:bg-entity-bg text-syntax-tx',
}

const pillClass = (variant: EntityVariant, className?: string) =>
  cn(
    'inline-flex items-center h-5 px-1 rounded w-fit',
    'border-[0.5px] border-entity-border',
    'font-mono text-sm font-medium tracking-tight whitespace-nowrap no-underline',
    variantClass[variant],
    className,
  )

export const EntityBadge = ({
  children,
  variant,
  className,
  externalHref,
}: {
  children: ReactNode
  variant: EntityVariant
  className?: string
  /** External link — opens in new tab */
  externalHref?: string
}) => {
  if (externalHref) {
    return (
      <ExternalLink
        href={externalHref}
        className={pillClass(variant, className)}
      >
        {children}
      </ExternalLink>
    )
  }

  return <span className={pillClass(variant, className)}>{children}</span>
}
