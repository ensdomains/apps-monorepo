import {
  ChevronDown,
  Clock,
  Image as ImageIcon,
  Languages,
  List,
  MapPin,
  Smile,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { LOCALES } from '@/lib/locales.config'
import { cn } from '@/lib/utils'
import type { ProfileRecords, TextRecordValue } from '../../types'
import { ImageSelectionDialog } from './ImageSelectionDialog'
import { UpdateStatusPanel } from './UpdateStatusPanel'

const generalShortcuts = [
  { field: 'avatar', label: 'Profile Picture', icon: Smile },
  { field: 'header', label: 'Header', icon: ImageIcon },
  { field: 'description', label: 'Description', icon: List },
  { field: 'location', label: 'Location', icon: MapPin },
  { field: 'timezone', label: 'Timezone', icon: Clock },
  { field: 'language', label: 'Language', icon: Languages },
] as const

export type GeneralField = (typeof generalShortcuts)[number]['field']

type BaseGeneralField =
  | 'avatar'
  | 'header'
  | 'name'
  | 'description'
  | 'language'

const timezoneOptions = Array.from({ length: 27 }, (_, index) => {
  const offset = index - 12
  return `UTC${offset >= 0 ? `+${offset}` : offset}`
})

const timezoneSelectOptions = timezoneOptions.map((value) => ({
  label: value,
  value,
}))

const languageOptions = Object.entries(LOCALES)
  .map(([value, label]) => ({ label, value }))
  .sort((languageA, languageB) =>
    languageA.label.localeCompare(languageB.label),
  )

const getTextRecordValue = (records: readonly TextRecordValue[], key: string) =>
  records.find((record) => record.key === key)?.value ?? ''

const setTextRecordValue = (
  records: readonly TextRecordValue[],
  key: string,
  value: string,
): TextRecordValue[] => {
  const nextRecords = records.filter((record) => record.key !== key)
  return value.trim() === '' ? nextRecords : [...nextRecords, { key, value }]
}

interface SelectFieldProps {
  readonly ariaLabel: string
  readonly disabled?: boolean
  readonly onChange: (value: string) => void
  readonly options: readonly {
    readonly label: string
    readonly value: string
  }[]
  readonly placeholder: string
  readonly value: string
}

const SelectField = ({
  ariaLabel,
  disabled,
  onChange,
  options,
  placeholder,
  value,
}: SelectFieldProps) => {
  const hasCustomValue =
    value.trim() !== '' && !options.some((option) => option.value === value)

  return (
    <div className="relative">
      <select
        aria-label={ariaLabel}
        className={cn(
          'h-16 w-full appearance-none rounded-md border border-input bg-transparent px-6 pr-12 text-lg shadow-xs outline-none transition-[color,box-shadow]',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
          value ? 'text-foreground' : 'text-muted-foreground',
        )}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{placeholder}</option>
        {hasCustomValue && <option value={value}>{value}</option>}
        {options.map(({ label, value: optionValue }) => (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        ))}
      </select>
      <ChevronDown className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-5 size-5 text-muted-foreground" />
    </div>
  )
}

export const getDefaultVisibleFields = (
  records: ProfileRecords,
): Set<GeneralField> =>
  new Set(
    generalShortcuts
      .map(({ field }) => field)
      .filter((field) => {
        if (
          field === 'avatar' ||
          field === 'header' ||
          field === 'description'
        ) {
          return true
        }

        if (field === 'location' || field === 'timezone') {
          return getTextRecordValue(records.contact, field).trim() !== ''
        }

        return (records.base[field] ?? '').trim() !== ''
      }),
  )

interface EditProfileGeneralTabProps {
  readonly errorMessage?: string
  readonly isSaving: boolean
  readonly isSuccess: boolean
  readonly name: string
  readonly onBaseChange: (base: ProfileRecords['base']) => void
  readonly onContactChange: (contact: ProfileRecords['contact']) => void
  readonly onToggleField: (field: GeneralField) => void
  readonly txHash?: string
  readonly values: ProfileRecords
  readonly visibleFields: ReadonlySet<GeneralField>
}

export const EditProfileGeneralTab = ({
  errorMessage,
  isSaving,
  isSuccess,
  name,
  onBaseChange,
  onContactChange,
  onToggleField,
  txHash,
  values,
  visibleFields,
}: EditProfileGeneralTabProps) => {
  const isVisible = (field: GeneralField) => visibleFields.has(field)
  const setBaseValue = (key: BaseGeneralField, value: string) =>
    onBaseChange({ ...values.base, [key]: value })

  return (
    <div className="space-y-6 px-1 pb-1">
      <div>
        <h2 className="font-semibold text-xl">General</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {generalShortcuts.map(({ field, icon: Icon, label }) => (
            <Button
              className={cn(
                'h-9 w-auto rounded-full px-3',
                isVisible(field)
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground',
              )}
              data-state={isVisible(field) ? 'active' : 'inactive'}
              key={label}
              onClick={() => onToggleField(field)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Icon className="size-4" />
              {label}
            </Button>
          ))}
        </div>
      </div>

      <UpdateStatusPanel
        errorMessage={errorMessage}
        hasValidationIssues={false}
        isSaving={isSaving}
        isSuccess={isSuccess}
        txHash={txHash}
      />

      {isVisible('avatar') && (
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="size-32 overflow-hidden rounded-md border border-dashed">
            <ImageSelectionDialog
              currentImage={values.base.avatar}
              defaultImage=""
              description="Choose a profile picture"
              name={name}
              onImageChange={(imageUrl) => setBaseValue('avatar', imageUrl)}
              onImageRemove={() => setBaseValue('avatar', '')}
              title="Change Profile Picture"
              type="avatar"
            />
          </div>
          <p className="text-muted-foreground text-sm">
            Add a profile picture <span>+</span>
          </p>
        </div>
      )}

      {isVisible('header') && (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-md border border-dashed">
            <ImageSelectionDialog
              currentImage={values.base.header}
              defaultImage=""
              description="Choose a header image"
              name={name}
              onImageChange={(imageUrl) => setBaseValue('header', imageUrl)}
              onImageRemove={() => setBaseValue('header', '')}
              title="Change Header Image"
              type="header"
            />
          </div>
          <p className="text-center text-muted-foreground text-sm">
            Add a banner image <span>+</span>
          </p>
        </div>
      )}

      <Input
        className="rounded-md"
        disabled={isSaving}
        label="Full name"
        onChange={(event) => setBaseValue('name', event.target.value)}
        placeholder="Full name"
        size="lg"
        value={values.base.name ?? ''}
      />

      {isVisible('description') && (
        <div className="space-y-2">
          <p className="font-medium text-sm">Description</p>
          <Textarea
            className="min-h-32 resize-none rounded-md"
            disabled={isSaving}
            onChange={(event) =>
              setBaseValue('description', event.target.value)
            }
            placeholder="Description"
            value={values.base.description ?? ''}
          />
        </div>
      )}

      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {isVisible('timezone') && (
            <SelectField
              ariaLabel="Timezone"
              disabled={isSaving}
              onChange={(value) =>
                onContactChange(
                  setTextRecordValue(values.contact, 'timezone', value),
                )
              }
              options={timezoneSelectOptions}
              placeholder="Timezone"
              value={getTextRecordValue(values.contact, 'timezone')}
            />
          )}
          {isVisible('language') && (
            <SelectField
              ariaLabel="Language"
              disabled={isSaving}
              onChange={(value) => setBaseValue('language', value)}
              options={languageOptions}
              placeholder="Language"
              value={values.base.language ?? ''}
            />
          )}
        </div>
        {isVisible('location') && (
          <Input
            className="h-16 rounded-md px-6 text-lg"
            disabled={isSaving}
            onChange={(event) =>
              onContactChange(
                setTextRecordValue(
                  values.contact,
                  'location',
                  event.target.value,
                ),
              )
            }
            placeholder="Location"
            value={getTextRecordValue(values.contact, 'location')}
          />
        )}
      </div>
    </div>
  )
}
