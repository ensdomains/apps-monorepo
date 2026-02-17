import { cn } from '@/lib/utils'

export type PremiumPillVariant = 'premium-3' | 'premium-4'

export type PremiumPillProps = {
  label: string
  variant: PremiumPillVariant
  className?: string
}

const variantStyles: Record<PremiumPillVariant, string> = {
  'premium-3':
    'rounded-[14.182px] bg-[linear-gradient(94deg,#E9D4BC_2.94%,#8E6616_299.58%)] text-black font-medium',
  'premium-4':
    'rounded-[14.182px] bg-[linear-gradient(103deg,#E2E8F0_22.67%,#606262_287.71%)] text-black font-medium',
}

export const PremiumPill = ({
  label,
  variant,
  className,
}: PremiumPillProps) => (
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
