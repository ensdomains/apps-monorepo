import { endOfDay } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import { CopyableRecord } from '@/components/CopyableRecord'
import { Button } from '@/components/ui/button'
import { SECONDS_PER_YEAR } from '@/lib/constants/duration'
import {
  getDurationInSecondsFromYears,
  getRegistrationDurationInSeconds,
  getRegistrationExpiryDateFromSeconds,
  getStartOfToday,
} from '../utils/registrationDuration'
import { RegistrationDurationPicker } from './RegistrationDurationPicker'
import { RegistrationExpiryDatePicker } from './RegistrationExpiryDatePicker'

type RegisterNameFormProps = {
  readonly name: string
  readonly duration: number
  readonly setDuration: (seconds: number) => void
}

enum REGISTRATION_SPAN_TYPE {
  YEARS = 'years',
  DATE = 'date',
}

export const RegisterNameForm = ({
  name,
  duration,
  setDuration,
}: RegisterNameFormProps) => {
  const [registrationSpanType, setRegistrationSpanType] =
    useState<REGISTRATION_SPAN_TYPE>(REGISTRATION_SPAN_TYPE.YEARS)

  const handleRegistrationSpanTypeChange = () => {
    if (registrationSpanType === REGISTRATION_SPAN_TYPE.YEARS) {
      setRegistrationSpanType(REGISTRATION_SPAN_TYPE.DATE)
    } else {
      setRegistrationSpanType(REGISTRATION_SPAN_TYPE.YEARS)
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
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-base font-medium">
            Register{' '}
            {registrationSpanType === REGISTRATION_SPAN_TYPE.YEARS
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
              {registrationSpanType === REGISTRATION_SPAN_TYPE.YEARS
                ? 'date'
                : 'years'}
            </span>
            <CalendarIcon className="size-3" />
          </Button>
        </div>

        {registrationSpanType === REGISTRATION_SPAN_TYPE.YEARS ? (
          <RegistrationDurationPicker
            value={Math.round(duration / SECONDS_PER_YEAR)}
            onChange={(years) =>
              setDuration(getDurationInSecondsFromYears(years))
            }
          />
        ) : (
          <RegistrationExpiryDatePicker
            date={endOfDay(
              getRegistrationExpiryDateFromSeconds(getStartOfToday(), duration),
            )}
            onDateChange={(date) =>
              setDuration(
                getRegistrationDurationInSeconds(
                  getStartOfToday(),
                  endOfDay(date),
                ),
              )
            }
            minDate={getStartOfToday()}
          />
        )}
      </div>
    </div>
  )
}
