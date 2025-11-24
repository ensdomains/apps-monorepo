import { DomainAttributePill } from '@/components/molecules/DomainResultCard/DomainAttributePill'
import type { PremiumLabel } from '@/features/register/utils'
import { cn } from '@/lib/utils'

type PricingDomainHeaderProps = {
  domainName: string
  premiumLabel: PremiumLabel | undefined
}

export const PricingDomainHeader = ({
  domainName,
  premiumLabel,
}: PricingDomainHeaderProps) => {
  return (
    <div className="flex flex-col items-center gap-2 text-center md:items-start md:text-left">
      {premiumLabel && (
        <DomainAttributePill
          label={premiumLabel.label}
          variant={premiumLabel.variant}
        />
      )}
      <h1
        className={cn(
          'font-semi-mono text-5xl text-ens-blue-midnight leading-none tracking-tighter sm:text-6xl md:text-7xl',
          'w-full',
          'overflow-x-auto',
          'whitespace-nowrap',
          'scrollbar-hide', // Hide scrollbar for cleaner look
        )}
        title={domainName}
      >
        {domainName}
      </h1>
    </div>
  )
}
