import { cn } from '@/lib/utils'

export type DomainAttributePillVariant = 'available' | 'premium-3' | 'premium-4'

export type DomainAttributePillProps = {
  label: string
  variant: DomainAttributePillVariant
  className?: string
}

const variantStyles: Record<DomainAttributePillVariant, string> = {
  available:
    'bg-[rgba(0,166,62,0.12)] text-[color:var(--availability-green)] font-medium',
  'premium-3':
    'bg-[linear-gradient(94deg,_#AE9582_3.56%,_#6F4C05_264.96%)] text-white font-medium italic',
  'premium-4': 'bg-[#C4C7C8] text-[#515151] font-medium italic',
}

export const DomainAttributePill = ({
  label,
  variant,
  className,
}: DomainAttributePillProps) => {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center gap-[10px] rounded-[12px] px-2 py-1 text-xs',
        variantStyles[variant],
        className,
      )}
    >
      {label}
    </span>
  )
}

DomainAttributePill.displayName = 'DomainAttributePill'
