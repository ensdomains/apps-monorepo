import { DomainAttributePill } from '@/components/molecules/DomainResultCard/DomainAttributePill'
import type { PremiumLabel } from '../types'

type PricingDomainHeaderProps = {
  domainName: string
  isPremium: boolean
  premiumLabel: PremiumLabel | null
}

export const PricingDomainHeader = ({
  domainName,
  isPremium,
  premiumLabel,
}: PricingDomainHeaderProps) => {
  return (
    <div className="flex flex-col items-center gap-2 text-center md:items-start md:text-left">
      {isPremium && premiumLabel && (
        <DomainAttributePill
          label={premiumLabel.label}
          variant={premiumLabel.variant}
        />
      )}
      <h1 className="font-semi-mono text-[#4a5c63] text-[48px] leading-none tracking-[-0.96px] sm:text-[64px] md:text-[96px] md:tracking-[-7.68px]">
        {domainName}
      </h1>
    </div>
  )
}
