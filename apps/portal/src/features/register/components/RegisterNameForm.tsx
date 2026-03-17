import { CalendarIcon, HashIcon } from 'lucide-react'
import { useState } from 'react'
import { CopyableRecord } from '@/components/CopyableRecord'
import { Button } from '@/components/ui/button'
import {
  getDurationFromPickerDate,
  getDurationInSecondsFromYears,
  getExpiryDateForPicker,
  getMinExpiryDateForPicker,
  getYearsFromDuration,
} from '../utils/registrationDuration'
import { RegistrationDurationPicker } from './RegistrationDurationPicker'
import { RegistrationExpiryDatePicker } from './RegistrationExpiryDatePicker'

type RegisterNameFormProps = {
  readonly name: string
  readonly duration: number
  readonly setDuration: (seconds: number) => void
}

type RegistrationSpanType = 'years' | 'date'

export const RegisterNameForm = ({
  name,
  duration,
  setDuration,
}: RegisterNameFormProps) => {
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
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <CopyableRecord
          value={name}
          textClassName="text-3xl sm:text-4xl font-medium"
        />
      </div>
      <div className="flex flex-col gap-4 border border-border rounded-lg px-6 pb-6 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-base font-medium">
            Register {registrationSpanType === 'years' ? 'for' : 'until'}
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
            onChange={(years) =>
              setDuration(getDurationInSecondsFromYears(years))
            }
          />
        ) : (
          <RegistrationExpiryDatePicker
            date={getExpiryDateForPicker(duration)}
            onDateChange={(date) =>
              setDuration(getDurationFromPickerDate(date))
            }
            minDate={getMinExpiryDateForPicker()}
          />
        )}
      </div>
    </div>
  )
}
