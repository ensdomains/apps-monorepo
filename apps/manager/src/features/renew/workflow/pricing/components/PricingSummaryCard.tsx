import { Trans } from '@lingui/react/macro'
import { shallowEqual, useSelector } from '@xstate/react'
import { format } from 'date-fns'
import { useMemo, useState } from 'react'
import { SECONDS_IN_YEAR } from '@/features/register-v2/utils/time'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'

export const PricingSummaryCard = () => {
  const { uiActor, currentExpiry } = useRenewalUiContext()
  const [durationYears, duration] = useSelector(
    uiActor,
    (state) =>
      [
        (state.context.duration / SECONDS_IN_YEAR).toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 3,
        }),
        state.context.duration,
      ] as const,
    shallowEqual,
  )
  const [now] = useState(() => {
    const value = new Date()
    value.setHours(0, 0, 0, 0)
    return value
  })

  const currentExpirationDate = useMemo(() => {
    if (!currentExpiry) {
      return now
    }
    return new Date(Number(currentExpiry) * 1000)
  }, [currentExpiry, now])

  const newExpirationDate = useMemo(() => {
    return new Date(currentExpirationDate.getTime() + duration * 1000)
  }, [currentExpirationDate, duration])

  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border-[#DDDDDE] border-[0.5px] bg-white px-6 py-8 font-[350] text-neutral-800 text-xl leading-ens-none shadow-temp-card md:px-12 md:py-6 md:text-2xl">
      <div>
        <Trans>Renewing for</Trans>{' '}
        <span className="font-normal text-[#024A70]">
          {durationYears} years
        </span>
      </div>
      <div>
        <Trans>expiring on</Trans>{' '}
        <span className="font-normal text-[#024A70]">
          {newExpirationDate ? format(newExpirationDate, 'MMMM d, yyyy') : ''}
        </span>
      </div>
    </div>
  )
}
