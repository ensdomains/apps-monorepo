import { useLingui } from '@lingui/react'
import { DomainAttributePill } from '@/components/molecules/DomainResultCard/DomainAttributePill'
import { cn } from '@/lib/utils'
import { getByteLength, getDomainHeaderSizeClasses } from '@/utils/domain'
import { getPremiumLabel } from '../lib/premiumLabel'
import { EthNameText } from './EthNameText'

export const PricingDomainHeader = ({ label }: { label: string }) => {
  const { _ } = useLingui()
  const name = `${label}.eth`
  const sizeClasses = getDomainHeaderSizeClasses(getByteLength(name))
  const premiumLabel = getPremiumLabel(label.length || 0)

  return (
    <div className="flex flex-col items-center gap-3 text-center md:items-start md:text-left">
      {premiumLabel && (
        <DomainAttributePill
          label={_(premiumLabel.label)}
          variant={premiumLabel.variant}
        />
      )}
      <h1
        className={cn(
          'font-semi-mono text-ens-gray leading-ens-none tracking-tighter',
          'wrap-break-word min-h-0 w-full',
          sizeClasses,
        )}
        title={name}
      >
        <EthNameText label={label} />
      </h1>
    </div>
  )
}
