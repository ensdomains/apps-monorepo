import { Trans } from '@lingui/react/macro'
import { useSelector } from '@xstate/react'
import { format } from 'date-fns'
import { useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { getDurationExpiryDateForDisplay } from '@/features/register-v2/utils/time'
import { DurationLabel } from '@/features/register-v2/workflow/pricing/components/DurationLabel'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'

export const PricingSummaryCard = () => {
  const { uiActor, currentExpiry } = useRenewalUiContext()
  const duration = useSelector(uiActor, (state) => state.context.duration)
  const currentExpirationDate = useMemo(
    () => new Date(Number(currentExpiry) * 1000),
    [currentExpiry],
  )

  const newExpirationDate = useMemo(() => {
    return getDurationExpiryDateForDisplay(
      Number(duration),
      currentExpirationDate,
    )
  }, [currentExpirationDate, duration])

  return (
    <Card className="items-center justify-center gap-1 px-6 py-8 font-[350] text-neutral-800 text-xl leading-ens-none md:px-12 md:py-6 md:text-2xl">
      <div className="flex flex-wrap items-baseline justify-center gap-x-1 text-center">
        <span>
          <Trans>Renewing for</Trans>
        </span>
        <span className="font-normal text-[#024A70]">
          <DurationLabel
            duration={Number(duration)}
            referenceDate={currentExpirationDate}
          />
        </span>
      </div>
      <div className="flex flex-wrap items-baseline justify-center gap-x-1 text-center">
        <span>
          <Trans>expiring on</Trans>
        </span>
        <span className="font-normal text-[#024A70]">
          {format(newExpirationDate, 'MMMM d, yyyy')}
        </span>
      </div>
    </Card>
  )
}
