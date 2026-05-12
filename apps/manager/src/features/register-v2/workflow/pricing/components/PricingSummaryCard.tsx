import { Trans } from '@lingui/react/macro'
import { useSelector } from '@xstate/react'
import { format, formatDuration } from 'date-fns'
import { secondsToDuration } from '@/features/register-v2/utils/time'
import { useRegistrationV2Context } from '../../../state/registrationUi.context'

export const PricingSummaryCard = () => {
  const { uiActor } = useRegistrationV2Context()
  const [durationYears, expirationDate] = useSelector(
    uiActor,
    (state) =>
      [
        formatDuration(secondsToDuration(state.context.duration), {
          format: ['years', 'months', 'weeks', 'days'],
        }),
        new Date(Date.now() + state.context.duration * 1000),
      ] as const,
    (a, b) => a[0] === b[0] && a[1].getTime() === b[1].getTime(),
  )

  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border-[#DDDDDE] border-[0.5px] bg-white px-6 py-8 text-center font-[350] text-neutral-800 text-xl leading-ens-none shadow-temp-card md:py-6 md:text-2xl">
      <div>
        <Trans>Registering for</Trans>{' '}
        <span className="font-[425] text-[#024A70]">{durationYears}</span>
      </div>
      <div>
        <Trans>expiring on</Trans>{' '}
        <span className="font-[425] text-[#024A70]">
          {format(expirationDate, 'MMMM d, yyyy')}
        </span>
      </div>
    </div>
  )
}
