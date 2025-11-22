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
          'font-semi-mono text-[48px] text-ens-blue-midnight leading-none tracking-[-0.96px] sm:text-[64px] md:text-[96px] md:tracking-[-7.68px]',
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
