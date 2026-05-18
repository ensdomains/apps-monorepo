import { Trans } from '@lingui/react/macro'
import { shallowEqual, useSelector } from '@xstate/react'
import { format, formatDuration } from 'date-fns'
import { useMemo } from 'react'
import { secondsToDuration } from '@/features/register-v2/utils/time'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'

export const PricingSummaryCard = () => {
  const { uiActor, currentExpiry } = useRenewalUiContext()
  const [durationLabel, duration] = useSelector(
    uiActor,
    (state) =>
      [
        formatDuration(secondsToDuration(state.context.duration), {
          format: ['years', 'months', 'weeks', 'days'],
        }),
        state.context.duration,
      ] as const,
    shallowEqual,
  )
  const currentExpirationDate = useMemo(
    () => new Date(Number(currentExpiry) * 1000),
    [currentExpiry],
  )

  const newExpirationDate = useMemo(() => {
    return new Date(currentExpirationDate.getTime() + duration * 1000)
  }, [currentExpirationDate, duration])

  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border-[#DDDDDE] border-[0.5px] bg-white px-6 py-8 font-[350] text-neutral-800 text-xl leading-ens-none shadow-temp-card md:px-12 md:py-6 md:text-2xl">
      <div>
        <Trans>Renewing for</Trans>{' '}
        <span className="font-normal text-[#024A70]">{durationLabel}</span>
      </div>
      <div>
        <Trans>expiring on</Trans>{' '}
        <span className="font-normal text-[#024A70]">
          {format(newExpirationDate, 'MMMM d, yyyy')}
        </span>
      </div>
    </div>
  )
}
