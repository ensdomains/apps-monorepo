import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface CountBadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  readonly value: number
}

const baseClassName =
  'inline-flex h-[19.68px] items-center justify-center rounded-[14px] bg-[#ffecf5] px-[6.56px] py-[1.64px] font-sans text-[#f53293] text-sm leading-[1.05] tracking-[0.28px]'

export const CountBadge = ({ value, className, ...props }: CountBadgeProps) => (
  <span className={cn(baseClassName, className)} {...props}>
    {value}
  </span>
)

CountBadge.displayName = 'CountBadge'
