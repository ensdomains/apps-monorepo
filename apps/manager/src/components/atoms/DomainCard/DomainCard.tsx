'use client'

import { cn } from '@/lib/utils'
import { DomainCardPattern, type DomainCardVariant } from './DomainCardPattern'

interface DomainCardProps {
  domainName: string
  variant?: DomainCardVariant | null
  className?: string
}

const cardColors = {
  garnet: {
    card: 'bg-ens-garnet-100',
    badge: 'bg-ens-garnet-500',
    text: 'text-white',
  },
  lapis: {
    card: 'bg-ens-lapis-100',
    badge: 'bg-ens-lapis-500',
    text: 'text-ens-citrine-100',
  },
  peridot: {
    card: 'bg-ens-peridot-100',
    badge: 'bg-ens-peridot-500',
    text: 'text-white',
  },
} as const

export const DomainCard = ({
  domainName,
  variant = 'garnet',
  className,
}: DomainCardProps) => {
  const selectedVariant = variant ?? 'garnet'
  const colors = cardColors[selectedVariant]

  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-[460px] flex-col gap-2.5 rounded p-2.5 shadow-[0_23px_16px_rgba(14,61,104,0.06)]',
        colors.card,
        className,
      )}
    >
      <div className="flex min-w-0">
        <div
          className={cn(
            'min-w-0 max-w-full rounded px-3 py-1.5 sm:px-4 sm:py-2',
            colors.badge,
          )}
        >
          <p
            className={cn(
              'break-words font-medium font-semi-mono text-[25px] leading-[0.96] tracking-[-0.02em] sm:text-[32px]',
              colors.text,
            )}
          >
            {domainName}
          </p>
        </div>
      </div>
      <DomainCardPattern variant={selectedVariant} />
    </div>
  )
}
