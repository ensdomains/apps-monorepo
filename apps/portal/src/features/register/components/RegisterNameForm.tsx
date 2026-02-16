import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'

type RegisterNameFormProps = {
  name: string
}

enum RegistrationSpanType {
  YEARS = 'years',
  DATE = 'date',
}

export const RegisterNameForm = ({ name }: RegisterNameFormProps) => {
  const [date, setDate] = useState<Date>(new Date())

  const [registrationSpanType, setRegistrationSpanType] =
    useState<RegistrationSpanType>(RegistrationSpanType.YEARS)

  const handleDateChange = (date: Date) => {
    setDate(date)
  }

  return (
    <div className="p-6 col-span-2">
      <div className="flex items-center gap-2">
        <h1 className="text-[40px] font-medium">{name}</h1>
        <CopyButton value={name} />
      </div>
      <div className="flex items-center justify-between py-6">
        <span className="text-base font-medium">Register for</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setRegistrationSpanType(
              registrationSpanType === RegistrationSpanType.YEARS
                ? RegistrationSpanType.DATE
                : RegistrationSpanType.YEARS,
            )
          }
          className="gap-1"
        >
          <span className="text-xs font-normal">
            Choose by{' '}
            {registrationSpanType === RegistrationSpanType.YEARS
              ? 'years'
              : 'date'}
          </span>
          <CalendarIcon className="size-3" />
        </Button>
      </div>
    </div>
  )
}
