import { useSelector } from '@xstate/react'
import { addMonths, addSeconds, format } from 'date-fns'
import { secondsInYear } from 'date-fns/constants'
import { useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { MIN_REGISTER_DURATION_SECONDS } from '@/features/register/components/Pricing/utils'
import { useRegistrationV2Context } from '../../machines/RegistrationV2UiContext'

export const PricingSummary = () => {
  const { uiActor } = useRegistrationV2Context()
  const [durationYears, expirationDate] = useSelector(
    uiActor,
    (state) =>
      [
        Math.round(state.context.duration / secondsInYear),
        new Date(Date.now() + state.context.duration * 1000),
      ] as const,
    (a, b) => a[0] === b[0] && a[1].getTime() === b[1].getTime(),
  )
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false)
  const [now] = useState(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return now
  })

  const minSelectableDate = addSeconds(now, MIN_REGISTER_DURATION_SECONDS)

  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-[#DDDDDE] bg-white px-6 py-12 font-[350] text-2xl text-neutral-800 leading-ens-none">
      <div className="">
        Registering for <span className="text-[#024A70]">{durationYears}</span>{' '}
        years
      </div>
      <div className="">expiring on</div>
      <Popover onOpenChange={setIsDatePopoverOpen} open={isDatePopoverOpen}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1 bg-ens-white/50 px-1 py-0.5 font-normal text-[#024A70]">
            <span className="font-normal text-[#024A70]">
              {format(expirationDate, 'MMMM d, yyyy')}
            </span>
            <MSymbol className="ms-opsz-20 ms-wght-400" symbol="edit" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-auto p-0">
          <Calendar
            captionLayout="dropdown"
            defaultMonth={expirationDate}
            disabled={(date) => {
              const minDate = new Date(minSelectableDate)
              minDate.setHours(0, 0, 0, 0)
              const dateToCheck = new Date(date)
              dateToCheck.setHours(0, 0, 0, 0)
              return dateToCheck.getTime() < minDate.getTime()
            }}
            endMonth={addMonths(new Date(), 1200)}
            onSelect={(date) => {
              if (date) {
                date.setHours(0, 0, 0, 0)
                console.log({ now, date })
                const duration = Math.max(
                  MIN_REGISTER_DURATION_SECONDS,
                  Math.round((date.getTime() - now.getTime()) / 1000),
                )
                uiActor.send({
                  type: 'pricing.duration.set',
                  duration,
                })
              }
            }}
            onToday={() => {
              const minDate = new Date(minSelectableDate)
              minDate.setHours(0, 0, 0, 0)
              console.log({ now, minDate })
              const duration = Math.max(
                MIN_REGISTER_DURATION_SECONDS,
                Math.round((minDate.getTime() - now.getTime()) / 1000),
              )
              uiActor.send({
                type: 'pricing.duration.set',
                duration,
              })
            }}
            selected={expirationDate}
            showTodayButton
            startMonth={minSelectableDate}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
