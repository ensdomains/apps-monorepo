import { Calendar } from 'lucide-react'

type PricingRegistrationSummaryCardProps = {
  paddedDuration: string
  formattedExpiration: string
}

export const PricingRegistrationSummaryCard = ({
  paddedDuration,
  formattedExpiration,
}: PricingRegistrationSummaryCardProps) => {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-[#ddddde] bg-white px-6 py-6 shadow-sm">
      <div className="w-full space-y-6">
        <div className="space-y-2 text-center">
          {/* Registering for X years */}
          <div className="flex items-baseline justify-center gap-[6px]">
            <span className="font-normal text-[20px] text-primary-midnight-blue leading-none tracking-[-0.2px] md:text-[24px] md:tracking-[-0.24px]">
              Registering for
            </span>
            <div className="rounded-sm bg-[rgba(245,245,245,0.5)] px-1 py-[2px]">
              <span className="font-medium text-[20px] text-brand-blue leading-none tracking-[-0.2px] md:text-[24px] md:tracking-[-0.24px]">
                {paddedDuration}
              </span>
            </div>
            <span className="font-normal text-[20px] text-primary-midnight-blue leading-none tracking-[-0.2px] md:text-[24px] md:tracking-[-0.24px]">
              years
            </span>
          </div>

          {/* Expiring on date */}
          <div className="space-y-[6px]">
            <span className="font-normal text-[20px] text-primary-midnight-blue leading-none tracking-[-0.2px] md:text-[24px] md:tracking-[-0.24px]">
              expiring on
            </span>
            <div className="inline-flex items-center gap-2 rounded-sm bg-[rgba(245,245,245,0.5)] px-1 py-[2px]">
              <Calendar className="size-4 text-brand-blue" />
              <span className="font-medium text-[20px] text-brand-blue leading-none tracking-[-0.2px] md:text-[24px] md:tracking-[-0.24px]">
                {formattedExpiration}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
