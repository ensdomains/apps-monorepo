import { match } from 'ts-pattern'
import { PricingDomainHeader } from '@/features/register/components/Pricing/PricingDomainHeader'
import type { PremiumLabel } from '@/features/register/utils'
import { DurationSelector } from './Duration'
import { PricingSummary } from './Summary'

export function PricingStep({ label }: { label: string }) {
  const labelKind: PremiumLabel | undefined = match(label.length)
    .with(
      3,
      () =>
        ({ label: '3 character premium name', variant: 'premium-3' }) as const,
    )
    .with(
      4,
      () =>
        ({ label: '4 character premium name', variant: 'premium-4' }) as const,
    )
    .otherwise(() => undefined)

  return (
    <div className="mx-auto h-screen w-full max-w-6xl">
      <PricingDomainHeader
        domainName={`${label}.eth`}
        premiumLabel={labelKind}
      />

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[2fr_420px] lg:items-stretch">
        {/* Left Column: Duration Selector */}
        <DurationSelector />

        {/* Right Column: Summary */}
        <div className="flex flex-col gap-2">
          <PricingSummary />
        </div>
      </div>
    </div>
  )
}
