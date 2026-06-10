import { CircleAlert } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { IconRenderer } from '@/features/profile/components/IconRenderer'
import { getRecordDef } from '@/features/profile/data/records'
import { cn } from '@/lib/utils'
import type { ContactMethod } from './constants'

interface ContactMethodRowProps {
  readonly disabled: boolean
  readonly errorMessage?: string
  readonly method: ContactMethod
  readonly onPrimaryChange: (method: ContactMethod, checked: boolean) => void
  readonly onValueChange: (method: ContactMethod, value: string) => void
  readonly primary: boolean
  readonly primaryDisabled: boolean
  readonly value: string
}

export const ContactMethodRow = ({
  disabled,
  errorMessage,
  method,
  onPrimaryChange,
  onValueChange,
  primary,
  primaryDisabled,
  value,
}: ContactMethodRowProps) => {
  const record = getRecordDef(method.key)

  return (
    <div className="flex w-full items-start gap-4 pt-1 pr-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <label
          className={cn(
            'flex h-11 min-w-0 items-center gap-2.5 rounded-sm border border-[#d4d4d4] px-4',
            errorMessage && 'border-red-600',
          )}
        >
          <IconRenderer
            className="size-3 shrink-0 text-ens-quartz-900"
            icon={record?.icon}
          />
          <input
            aria-invalid={Boolean(errorMessage)}
            aria-label={method.label}
            className="min-w-0 flex-1 bg-transparent text-[16px] leading-[1.2] outline-none placeholder:text-ens-quartz-400 disabled:pointer-events-none"
            disabled={disabled}
            onChange={(event) => onValueChange(method, event.target.value)}
            placeholder={method.placeholder}
            type={'type' in method ? method.type : 'text'}
            value={value}
          />
        </label>
        {errorMessage ? (
          <p
            className="flex items-center gap-1.5 text-[14px] text-red-700 leading-[1.2]"
            role="alert"
          >
            <CircleAlert
              aria-hidden="true"
              className="size-4.5 shrink-0 text-red-700"
              strokeWidth={2}
            />
            <span>{errorMessage}</span>
          </p>
        ) : null}
      </div>
      <Switch
        aria-label={`Pin ${method.label} as a primary contact method`}
        checked={primary}
        className={cn(
          'mt-3 h-5 w-10 shrink-0 border border-transparent bg-ens-quartz-300 data-[state=checked]:bg-ens-signal-success-600 [&>span]:size-[17px] [&>span]:data-[state=checked]:translate-x-5',
          (disabled || primaryDisabled) && 'cursor-not-allowed opacity-60',
        )}
        disabled={disabled || primaryDisabled}
        onCheckedChange={(checked) => onPrimaryChange(method, checked)}
      />
    </div>
  )
}
