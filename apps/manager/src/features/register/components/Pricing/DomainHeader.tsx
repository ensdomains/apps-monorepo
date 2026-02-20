import { DomainAttributePill } from '@/components/molecules/DomainResultCard/DomainAttributePill'
import { cn } from '@/lib/utils'
import { getByteLength, getDomainHeaderSizeClasses } from '@/utils/domain'
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
  const sizeClasses = getDomainHeaderSizeClasses(getByteLength(domainName))

  return (
    <div className="flex flex-col items-center gap-2 text-center md:items-start md:text-left">
      {isPremium && premiumLabel && (
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
