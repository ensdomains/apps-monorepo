import { useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { ExtensionDurationOrExpiryPicker } from '@/features/renew/components/ExtensionDurationOrExpiryPicker'
import {
  DEFAULT_SUBNAME_EXPIRY,
  type SubnameExpiry,
} from '../utils/subnameExpiry'

type SubnameExpiryFieldProps = {
  readonly expiry: SubnameExpiry
  readonly onExpiryChange: (expiry: SubnameExpiry) => void
  readonly disabled?: boolean
}

/** A new subname has no expiry unless "Set expiration" is ticked, which shows the picker. */
export const SubnameExpiryField = ({
  expiry,
  onExpiryChange,
  disabled = false,
}: SubnameExpiryFieldProps) => {
  const checkboxId = useId()
  return (
    <div className="flex flex-col gap-4">
      <label
        htmlFor={checkboxId}
        className="flex items-start gap-3 cursor-pointer"
      >
        <Checkbox
          id={checkboxId}
          checked={expiry.type === 'span'}
          onCheckedChange={(checked) =>
            onExpiryChange(
              checked === true
                ? { type: 'span', span: { type: 'years', years: 1 } }
                : DEFAULT_SUBNAME_EXPIRY,
            )
          }
          disabled={disabled}
          className="mt-0.5"
        />
        <span className="flex flex-col gap-1">
          <span className="font-medium">Set expiration</span>
          {expiry.type === 'span' && (
            <span className="text-p text-muted-foreground">
              The new owner loses it on the date you pick, unless it’s extended.
              It can then be created again.
            </span>
          )}
        </span>
      </label>
      {expiry.type === 'span' && (
        <ExtensionDurationOrExpiryPicker
          span={expiry.span}
          setSpan={(span) => onExpiryChange({ type: 'span', span })}
          disabled={disabled}
        />
      )}
    </div>
  )
}
