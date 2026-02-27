import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as m from '@/paraglide/messages.js'

type PrimaryBadgeProps = {
  label?: string
  className?: string
}

export const PrimaryBadge = ({ label, className }: PrimaryBadgeProps) => {
  const resolvedLabel = label ?? m.primaryBadge_label()

  return (
    <div
      className={cn(
        'inline-flex items-center gap-[8px] rounded-[73px] bg-ens-white px-[6.5px] py-[3.3px]',
        className,
      )}
    >
      <span className="font-sans text-[13px] text-ens-blue leading-[1.15] tracking-[-0.24px] md:text-[16px]">
        {resolvedLabel}
      </span>
      <div className="flex size-[13px] items-center justify-center rounded-full bg-ens-blue">
        <Check className="size-[8px] text-ens-white" strokeWidth={4} />
      </div>
    </div>
  )
}
