import type { ReactNode } from 'react'
import { ExternalLink } from 'react-external-link'
import { cn } from '@/lib/utils'

export type EntityVariant = 'name' | 'address' | 'contract' | 'tx'

const variantClass: Record<EntityVariant, string> = {
  name: 'text-syntax-name',
  address: 'text-syntax-address',
  contract: 'text-syntax-contract',
  tx: 'text-syntax-tx',
}

const pillClass = (variant: EntityVariant, className?: string) =>
  cn(
    'inline-flex items-center h-5 px-1 rounded w-fit',
    'bg-entity-bg border-[0.5px] border-entity-border',
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
