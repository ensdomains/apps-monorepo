import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { getRecordDef } from '../../data/records'
import { IconRenderer } from '../IconRenderer'
import type { ContactMethod } from './EditProfileContactTab.constants'

interface EditProfileContactMethodRowProps {
  readonly disabled: boolean
  readonly method: ContactMethod
  readonly onPrimaryChange: (method: ContactMethod, checked: boolean) => void
  readonly onValueChange: (method: ContactMethod, value: string) => void
  readonly primary: boolean
  readonly primaryDisabled: boolean
  readonly value: string
}

export const EditProfileContactMethodRow = ({
  disabled,
  method,
  onPrimaryChange,
  onValueChange,
  primary,
  primaryDisabled,
  value,
}: EditProfileContactMethodRowProps) => {
  const record = getRecordDef(method.key)

  return (
    <div className="flex h-12 w-full items-center gap-4 pt-1 pr-4">
      <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-sm border border-[#d4d4d4] px-4">
        <IconRenderer
          className="size-3 shrink-0 text-ens-quartz-900"
          icon={record?.icon}
        />
        <input
          aria-label={method.label}
          className="min-w-0 flex-1 bg-transparent text-[16px] text-ens-quartz-400 leading-[1.2] outline-none placeholder:text-ens-quartz-400 disabled:pointer-events-none"
          disabled={disabled}
          onChange={(event) => onValueChange(method, event.target.value)}
          placeholder={method.placeholder}
          type={'type' in method ? method.type : 'text'}
          value={value}
        />
      </label>
      <Switch
        aria-label={`Pin ${method.label} as a primary contact method`}
        checked={primary}
        className={cn(
          'h-5 w-10 shrink-0 border border-transparent bg-ens-quartz-300 data-[state=checked]:bg-ens-signal-success-600 [&>span]:size-[17px] [&>span]:data-[state=checked]:translate-x-5',
          (disabled || primaryDisabled) && 'cursor-not-allowed opacity-60',
        )}
        disabled={disabled || primaryDisabled}
        onCheckedChange={(checked) => onPrimaryChange(method, checked)}
      />
    </div>
  )
}
