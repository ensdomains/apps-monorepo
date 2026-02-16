import { CalendarIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/ui/button'
import {
  calculateDurationFromDate,
  calculateExpirationDate,
} from '../utils/registrationDuration'
import { RegistrationDurationPicker } from './RegistrationDurationPicker'
import { RegistrationExpiryDatePicker } from './RegistrationExpiryDatePicker'
import { RegistrationOptionalSettings } from './RegistrationOptionalSettings'

type RegisterNameFormProps = {
  name: string
  expiryDate: Date
  setExpiryDate: (date: Date) => void
}

enum RegistrationSpanType {
  YEARS = 'years',
  DATE = 'date',
}

export const RegisterNameForm = ({
  name,
  expiryDate,
  setExpiryDate,
}: RegisterNameFormProps) => {
  const duration = useMemo(
    () => calculateDurationFromDate(expiryDate),
    [expiryDate],
  )

  const [registrationSpanType, setRegistrationSpanType] =
    useState<RegistrationSpanType>(RegistrationSpanType.YEARS)

  const handleRegistrationSpanTypeChange = () => {
    if (registrationSpanType === RegistrationSpanType.YEARS) {
      setRegistrationSpanType(RegistrationSpanType.DATE)
    } else {
      setRegistrationSpanType(RegistrationSpanType.YEARS)
    }

    setExpiryDate(calculateExpirationDate(1.5))
  }

  return (
    <div className="p-6 col-span-3">
      <div className="flex items-center gap-2">
        <h1 className="text-4xl font-medium">{name}</h1>
        <CopyButton value={name} />
      </div>
      <div className="flex flex-col gap-2 py-6">
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
            value={duration}
            onChange={(years) => setExpiryDate(calculateExpirationDate(years))}
          />
        ) : (
          <RegistrationExpiryDatePicker
            date={expiryDate}
            onDateChange={setExpiryDate}
            minDate={new Date()}
          />
        )}
      </div>
      <RegistrationOptionalSettings />
    </div>
  )
}
