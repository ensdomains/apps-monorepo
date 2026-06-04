import { ChevronDown } from 'lucide-react'
import { type MaterialSymbol, MSymbol } from '@/components/ui/material-symbol'
import { LOCALES } from '@/lib/locales.config'
import { cn } from '@/lib/utils'
import type { ProfileRecords, TextRecordValue } from '../../types'
import { EditProfileFieldPickerPill } from './EditProfileFieldPickerPill'
import { ImageSelectionDialog } from './ImageSelectionDialog'
import { UpdateStatusPanel } from './UpdateStatusPanel'

const generalShortcuts = [
  { field: 'avatar', label: 'Profile picture', symbol: 'face' },
  { field: 'header', label: 'Header', symbol: 'wall_art' },
  { field: 'description', label: 'Description', symbol: 'text_ad' },
  { field: 'location', label: 'Location', symbol: 'add_location_alt' },
  { field: 'timezone', label: 'Timezone', symbol: 'captive_portal' },
  { field: 'language', label: 'Language', symbol: 'language' },
] as const satisfies readonly {
  field: string
  label: string
  symbol: MaterialSymbol
}[]

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

const fieldClassName =
  'w-full rounded-sm border border-[#d4d4d4] bg-transparent p-4 text-[16px] text-ens-quartz-900 outline-none transition-colors placeholder:text-[#737373] focus-visible:border-ens-lapis-500 disabled:pointer-events-none disabled:opacity-50'

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
          fieldClassName,
          'appearance-none pr-12',
          value ? 'text-ens-quartz-900' : 'text-[#737373]',
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
      <ChevronDown className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-4 size-5 text-[#737373]" />
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
    <div className="flex flex-col gap-4 pb-4">
      <p className="font-bold font-sans text-[#525252] text-[16px] leading-[0.96] tracking-[-0.32px]">
        General
      </p>

      <div className="flex flex-wrap gap-2">
        {generalShortcuts.map(({ field, symbol, label }) => {
          const active = isVisible(field)
          return (
            <EditProfileFieldPickerPill
              active={active}
              icon={
                <MSymbol
                  className="shrink-0 text-current"
                  style={{ fontSize: 14 }}
                  symbol={symbol}
                />
              }
              key={field}
              label={label}
              onClick={() => onToggleField(field)}
            />
          )
        })}
      </div>

      <UpdateStatusPanel
        errorMessage={errorMessage}
        hasValidationIssues={false}
        isSaving={isSaving}
        isSuccess={isSuccess}
        txHash={txHash}
      />

      <div className="flex flex-col items-center gap-3">
        {isVisible('avatar') && (
          <div className="flex flex-col items-center gap-3.5 py-3">
            <div className="size-[100px] overflow-hidden rounded-sm border-[#d4d4d4] border-[0.5px] border-dashed bg-ens-quartz-50">
              <ImageSelectionDialog
                currentImage={values.base.avatar}
                defaultImage=""
                description="Choose a profile picture"
                emptyState={
                  <div className="flex size-full items-center justify-center">
                    <MSymbol
                      className="text-ens-quartz-380"
                      style={{ fontSize: 32 }}
                      symbol="face"
                    />
                  </div>
                }
                name={name}
                onImageChange={(imageUrl) => setBaseValue('avatar', imageUrl)}
                onImageRemove={() => setBaseValue('avatar', '')}
                title="Change Profile Picture"
                triggerClassName="h-full w-full"
                type="avatar"
              />
            </div>
            <p className="flex items-center gap-2 text-[14px] text-ens-quartz-400">
              Add a profile picture
              <MSymbol
                className="ms-fill"
                style={{ fontSize: 14 }}
                symbol="add"
              />
            </p>
          </div>
        )}

        {isVisible('header') && (
          <div className="h-[168px] w-full overflow-hidden rounded-sm border-[#d4d4d4] border-[0.5px] border-dashed bg-ens-quartz-50">
            <ImageSelectionDialog
              currentImage={values.base.header}
              defaultImage=""
              description="Choose a header image"
              emptyState={
                <div className="flex size-full items-center justify-center gap-2 text-[14px] text-ens-quartz-500">
                  Add a banner image
                  <MSymbol style={{ fontSize: 14 }} symbol="add" />
                </div>
              }
              name={name}
              onImageChange={(imageUrl) => setBaseValue('header', imageUrl)}
              onImageRemove={() => setBaseValue('header', '')}
              title="Change Header Image"
              triggerClassName="h-full w-full"
              type="header"
            />
          </div>
        )}

        <input
          className={fieldClassName}
          disabled={isSaving}
          onChange={(event) => setBaseValue('name', event.target.value)}
          placeholder="Full name"
          value={values.base.name ?? ''}
        />

        {isVisible('description') && (
          <textarea
            className={cn(fieldClassName, 'min-h-[101px] resize-none')}
            disabled={isSaving}
            onChange={(event) =>
              setBaseValue('description', event.target.value)
            }
            placeholder="Description"
            value={values.base.description ?? ''}
          />
        )}

        {(isVisible('timezone') || isVisible('language')) && (
          <div className="grid w-full gap-3 md:grid-cols-2">
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
        )}

        {isVisible('location') && (
          <input
            className={fieldClassName}
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
