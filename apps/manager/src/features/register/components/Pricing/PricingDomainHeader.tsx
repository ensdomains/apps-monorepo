import { DomainAttributePill } from '@/components/molecules/DomainResultCard/DomainAttributePill'
import type { PremiumLabel } from '@/features/register/utils'
import { cn } from '@/lib/utils'
import { getByteLength, getDomainHeaderSizeClasses } from './utils'

type PricingDomainHeaderProps = {
  domainName: string
  premiumLabel: PremiumLabel | undefined
}

export const PricingDomainHeader = ({
  domainName,
  premiumLabel,
}: PricingDomainHeaderProps) => {
  const sizeClasses = getDomainHeaderSizeClasses(getByteLength(domainName))

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
          'font-semi-mono text-ens-blue-midnight leading-tight tracking-tighter',
          'min-h-0 w-full break-words',
          sizeClasses,
        )}
        title={domainName}
      >
        {domainName}
      </h1>
    </div>
  )
}
