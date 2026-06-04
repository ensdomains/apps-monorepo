import { cn } from '@/lib/utils'
import { getRecordDef } from '../../data/records'
import { IconRenderer } from '../IconRenderer'
import type { ContactMethod } from './EditProfileContactTab.constants'

interface PrimaryContactSwitchProps {
  readonly checked: boolean
  readonly disabled: boolean
  readonly label: string
  readonly onCheckedChange: (checked: boolean) => void
}

const PrimaryContactSwitch = ({
  checked,
  disabled,
  label,
  onCheckedChange,
}: PrimaryContactSwitchProps) => (
  <button
    aria-checked={checked}
    aria-label={label}
    className={cn(
      'relative h-5 w-10 shrink-0 rounded-full border border-transparent transition-colors',
      checked ? 'bg-ens-signal-success-600' : 'bg-ens-quartz-300',
      disabled && 'cursor-not-allowed opacity-60',
    )}
    disabled={disabled}
    onClick={() => onCheckedChange(!checked)}
    role="switch"
    type="button"
  >
    <span
      className={cn(
        'absolute top-[0.5px] size-[17px] rounded-full bg-white transition-all',
        checked ? 'left-5' : 'left-px',
      )}
    />
  </button>
)

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
      <PrimaryContactSwitch
        checked={primary}
        disabled={disabled || primaryDisabled}
        label={`Pin ${method.label} as a primary contact method`}
        onCheckedChange={(checked) => onPrimaryChange(method, checked)}
      />
    </div>
  )
}
