import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type EntityVariant = 'name' | 'address' | 'contract' | 'tx'

const variantClass: Record<EntityVariant, string> = {
  name: 'text-syntax-name',
  address: 'text-syntax-address',
  contract: 'text-syntax-contract',
  tx: 'text-syntax-tx',
}

export function EntityBadge({
  children,
  variant,
  className,
}: {
  children: ReactNode
  variant: EntityVariant
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center h-5 px-1 rounded w-fit',
        'bg-entity-bg border-[0.5px] border-entity-border',
        'font-mono text-sm font-medium tracking-tight whitespace-nowrap no-underline',
        variantClass[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
