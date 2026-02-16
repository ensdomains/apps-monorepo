import { useState } from 'react'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'

type RegisterNameFormProps = {
  name: string
}

export const RegisterNameForm = ({ name }: RegisterNameFormProps) => {
  const [date, setDate] = useState<Date>(new Date())

  const handleDateChange = (date: Date) => {
    setDate(date)
  }

  return (
    <div className="p-6 col-span-2">
      <div className="flex items-center gap-2">
        <h1 className="text-[40px] font-medium">{name}</h1>
        <CopyButton value={name} />
      </div>
      <div>
        <span>Register for </span>
        <DatePicker
          date={date}
          onDateChange={handleDateChange}
          trigger={<Button>Select date</Button>}
        />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">
          The name you are registering is the one you will use to access your
          account.
        </p>
      </div>
    </div>
  )
}
