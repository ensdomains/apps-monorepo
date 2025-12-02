import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

type PrimaryBadgeProps = {
  label?: string
  className?: string
}

export const PrimaryBadge = ({
  label = 'Primary Name',
  className,
}: PrimaryBadgeProps) => (
  <div
    className={cn(
      'inline-flex items-center gap-[8px] rounded-[73px] bg-[#f6f6f6] px-[6.5px] py-[3.3px]',
      className,
    )}
  >
    <span className="font-sans text-[#0080bc] text-[12px] leading-[1.15] tracking-[-0.24px]">
      {label}
    </span>
    <div className="flex size-[10px] items-center justify-center rounded-full bg-[#0080bc]">
      <Check className="size-[6px] text-[#f6f6f6]" strokeWidth={4} />
    </div>
  </div>
)
