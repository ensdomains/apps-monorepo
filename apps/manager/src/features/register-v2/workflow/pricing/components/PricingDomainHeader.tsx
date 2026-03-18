import { DomainAttributePill } from '@/components/molecules/DomainResultCard/DomainAttributePill'
import { getByteLength, getDomainHeaderSizeClasses } from '@/utils/domain'
import { twm } from '@/utils/tailwind'
import { useRegistrationV2Context } from '../../../state/registrationUi.context'
import { getPremiumLabel } from '../lib/premiumLabel'

export const PricingDomainHeader = () => {
  const { label } = useRegistrationV2Context()

  const name = `${label}.eth`
  const sizeClasses = getDomainHeaderSizeClasses(getByteLength(name))
  const premiumLabel = getPremiumLabel(label.length)

  return (
    <div className="flex flex-col items-center gap-2 text-center md:items-start md:text-left">
      {premiumLabel && (
        <DomainAttributePill
          label={premiumLabel.label}
          variant={premiumLabel.variant}
        />
      )}
      <h1
        className={twm(
          'font-semi-mono text-ens-gray leading-ens-none tracking-tighter',
          'wrap-break-word min-h-0 w-full',
          sizeClasses,
        )}
        title={name}
      >
        {name}
      </h1>
    </div>
  )
}
