import { CalendarIcon, HashIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RegistrationDurationPicker } from '@/features/register/components/RegistrationDurationPicker'
import { RegistrationExpiryDatePicker } from '@/features/register/components/RegistrationExpiryDatePicker'
import {
  getMaxExpiryDateForPicker,
  getMinExpiryDateForPicker,
  getStartOfToday,
} from '@/features/register/utils/registrationDuration'
import { MAX_REGISTRATION_YEARS } from '@/lib/constants/duration'
import { cn } from '@/lib/utils'
import { dateToPlainDate } from '@/utils/temporal'
import {
  type ExtensionSpan,
  getExtensionDisplayedYears,
  getExtensionTargetDate,
  getToggledExtensionSpan,
} from '../utils/extensionDurationPicker'

type ExtensionDurationOrExpiryPickerProps = {
  readonly disabled?: boolean
  readonly span: ExtensionSpan
  readonly setSpan: (span: ExtensionSpan) => void
  /** Base date for duration calculations (use name's current expiry for renewal) */
  readonly expiryDate?: Date | null
  /** Name used to compute per-year prices for preset chips. Chips hidden if absent. */
  readonly name?: string
}

export const ExtensionDurationOrExpiryPicker = ({
  disabled = false,
  span,
  setSpan,
  expiryDate,
  name,
}: ExtensionDurationOrExpiryPickerProps) => {
  const baseDate = expiryDate ? dateToPlainDate(expiryDate) : getStartOfToday()
  const targetDate = getExtensionTargetDate(baseDate, span)
  const displayedYears = getExtensionDisplayedYears(baseDate, span)

  return (
    <div
      className={cn(
        'flex flex-col gap-4 border border-border rounded-lg px-6 pb-6 pt-4',
        disabled && 'opacity-50 pointer-events-none',
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-lg font-medium">
            {span.type === 'years' ? 'For' : 'Until'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSpan(getToggledExtensionSpan(baseDate, span))}
            className="gap-1 text-primary"
          >
            <span className="text-small font-normal">
              {span.type === 'years' ? 'Pick by date' : 'Choose length'}
            </span>
            {span.type === 'years' ? (
              <CalendarIcon className="size-3" />
            ) : (
              <HashIcon className="size-3" />
            )}
          </Button>
        </div>

        {span.type === 'years' ? (
          <RegistrationDurationPicker
            value={displayedYears}
            max={MAX_REGISTRATION_YEARS}
            onChange={(years) => setSpan({ type: 'years', years })}
            name={name}
            baseDate={baseDate}
          />
        ) : (
          <RegistrationExpiryDatePicker
            date={targetDate}
            onDateChange={(date) => setSpan({ type: 'date', date })}
            onYearsPresetSelect={(years) =>
              setSpan({
                type: 'date',
                date: getExtensionTargetDate(baseDate, {
                  type: 'years',
                  years,
                }),
              })
            }
            minDate={getMinExpiryDateForPicker(baseDate)}
            maxDate={getMaxExpiryDateForPicker(baseDate)}
            baseDate={baseDate}
            name={name}
          />
        )}
      </div>
    </div>
  )
}
