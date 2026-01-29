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
      'inline-flex items-center gap-[8px] rounded-[73px] bg-ens-white px-[6.5px] py-[3.3px]',
      className,
    )}
  >
    <span className="font-sans text-[12px] text-ens-blue leading-[1.15] tracking-[-0.24px]">
      {label}
    </span>
    <div className="flex size-[10px] items-center justify-center rounded-full bg-ens-blue">
      <Check className="size-[6px] text-ens-white" strokeWidth={4} />
    </div>
  </div>
)
