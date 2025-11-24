import { DomainAttributePill } from '@/components/molecules/DomainResultCard/DomainAttributePill'
import type { PremiumLabel } from './types'

type DomainHeaderProps = {
  domainName: string
  isPremium: boolean
  premiumLabel: PremiumLabel | null
}

export const DomainHeader = ({
  domainName,
  isPremium,
  premiumLabel,
}: DomainHeaderProps) => {
  return (
    <div className="flex flex-col items-center gap-2 text-center md:items-start md:text-left">
      {isPremium && premiumLabel && (
        <DomainAttributePill
          label={premiumLabel.label}
          variant={premiumLabel.variant}
        />
      )}
      <h1 className="font-semi-mono text-5xl text-ens-blue-midnight leading-none tracking-tighter sm:text-6xl md:text-7xl">
        {domainName}
      </h1>
    </div>
  )
}
