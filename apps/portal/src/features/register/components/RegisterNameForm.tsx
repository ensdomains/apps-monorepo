import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import { CopyableRecord } from '@/components/CopyableRecord'
import { Button } from '@/components/ui/button'
import { SECONDS_PER_YEAR } from '@/lib/constants/duration'
import {
  getDurationInSeconds,
  getDurationInSecondsFromYears,
  getExpiryDateFromSeconds,
} from '../utils/registrationDuration'
import { RegistrationDurationPicker } from './RegistrationDurationPicker'
import { RegistrationExpiryDatePicker } from './RegistrationExpiryDatePicker'

type RegisterNameFormProps = {
  readonly name: string
  readonly duration: number
  readonly setDuration: (seconds: number) => void
}

enum RegistrationSpanType {
  YEARS = 'years',
  DATE = 'date',
}

export const RegisterNameForm = ({
  name,
  duration,
  setDuration,
}: RegisterNameFormProps) => {
  const [registrationSpanType, setRegistrationSpanType] =
    useState<RegistrationSpanType>(RegistrationSpanType.YEARS)

  const handleRegistrationSpanTypeChange = () => {
    if (registrationSpanType === RegistrationSpanType.YEARS) {
      setRegistrationSpanType(RegistrationSpanType.DATE)
    } else {
      setRegistrationSpanType(RegistrationSpanType.YEARS)
    }

    setDuration(getDurationInSecondsFromYears(2))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <CopyableRecord
          value={name}
          textClassName="text-3xl sm:text-4xl font-medium"
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-base font-medium">
            Register{' '}
            {registrationSpanType === RegistrationSpanType.YEARS
              ? 'for'
              : 'until'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRegistrationSpanTypeChange}
            className="gap-1"
          >
            <span className="text-xs font-normal">
              Choose by{' '}
              {registrationSpanType === RegistrationSpanType.YEARS
                ? 'date'
                : 'years'}
            </span>
            <CalendarIcon className="size-3" />
          </Button>
        </div>

        {registrationSpanType === RegistrationSpanType.YEARS ? (
          <RegistrationDurationPicker
            value={Math.round(duration / SECONDS_PER_YEAR)}
            onChange={(years) =>
              setDuration(getDurationInSecondsFromYears(years))
            }
          />
        ) : (
          <RegistrationExpiryDatePicker
            date={getExpiryDateFromSeconds(duration)}
            onDateChange={(date) => setDuration(getDurationInSeconds(date))}
            minDate={new Date()}
          />
        )}
      </div>
    </div>
  )
}
