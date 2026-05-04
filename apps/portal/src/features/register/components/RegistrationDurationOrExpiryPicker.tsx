import { CalendarIcon, HashIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MAX_REGISTRATION_YEARS } from '@/lib/constants/duration'
import { cn } from '@/lib/utils'
import { dateToPlainDate } from '@/utils/temporal'
import {
  getDurationFromPickerDate,
  getDurationInSecondsFromYears,
  getExpiryDateForPicker,
  getMaxExpiryDateForPicker,
  getMinExpiryDateForPicker,
  getYearsFromDuration,
} from '../utils/registrationDuration'
import { RegistrationDurationPicker } from './RegistrationDurationPicker'
import { RegistrationExpiryDatePicker } from './RegistrationExpiryDatePicker'

export type RegistrationSpanType = 'years' | 'date'

type RegistrationDurationOrExpiryPickerProps = {
  readonly labelPrefix?: string
  readonly disabled?: boolean
  readonly duration: number
  readonly setDuration: (duration: number) => void
  /** Anchor for picker date math; defaults to today. Pass current expiry for extensions. */
  readonly baseDate?: Date
  /** Name used to compute per-year prices for preset chips. Chips hidden if absent. */
  readonly name?: string
}

export const RegistrationDurationOrExpiryPicker = ({
  labelPrefix,
  disabled = false,
  duration,
  setDuration,
  baseDate,
  name,
}: RegistrationDurationOrExpiryPickerProps) => {
  const anchor = baseDate ? dateToPlainDate(baseDate) : undefined
  const [registrationSpanType, setRegistrationSpanType] =
    useState<RegistrationSpanType>('years')

  const handleRegistrationSpanTypeChange = () => {
    if (registrationSpanType === 'years') {
      setRegistrationSpanType('date')
    } else {
      setRegistrationSpanType('years')
      const displayedYears = Math.max(
        1,
        Math.round(getYearsFromDuration(duration)),
      )
      setDuration(getDurationInSecondsFromYears(displayedYears))
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-4 border border-border rounded-sm px-6 pb-6 pt-4',
        disabled && 'opacity-50 pointer-events-none',
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-base font-medium">
            {labelPrefix ? `${labelPrefix} ` : ''}
            {registrationSpanType === 'years' ? 'For' : 'Until'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRegistrationSpanTypeChange}
            className="gap-1 text-primary"
          >
            <span className="text-xs font-normal">
              Choose by {registrationSpanType === 'years' ? 'date' : 'years'}
            </span>
            {registrationSpanType === 'years' ? (
              <CalendarIcon className="size-3" />
            ) : (
              <HashIcon className="size-3" />
            )}
          </Button>
        </div>

        {registrationSpanType === 'years' ? (
          <RegistrationDurationPicker
            value={Math.max(1, Math.round(getYearsFromDuration(duration)))}
            max={MAX_REGISTRATION_YEARS}
            onChange={(years) =>
              setDuration(getDurationInSecondsFromYears(years))
            }
            name={name}
          />
        ) : (
          <RegistrationExpiryDatePicker
            date={getExpiryDateForPicker(duration, anchor)}
            onDateChange={(date) =>
              setDuration(getDurationFromPickerDate(date, anchor))
            }
            minDate={getMinExpiryDateForPicker(anchor)}
            maxDate={getMaxExpiryDateForPicker(anchor)}
          />
        )}
      </div>
    </div>
  )
}
