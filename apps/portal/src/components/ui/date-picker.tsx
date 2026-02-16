'use client'

import type * as React from 'react'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

type DatePickerProps = {
  date: Date
  onDateChange: (date: Date) => void
  trigger: React.ReactNode
}

export function DatePicker({ date, onDateChange, trigger }: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          required
          selected={date}
          onSelect={onDateChange}
          defaultMonth={date}
        />
      </PopoverContent>
    </Popover>
  )
}
