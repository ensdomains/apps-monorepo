import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { getRecordDef } from '../../data/records'
import type { ProfileRecords, TextRecordValue } from '../../types'
import { IconRenderer } from '../IconRenderer'
import { EditProfileFieldPickerPill } from './EditProfileFieldPickerPill'
import { UpdateStatusPanel } from './UpdateStatusPanel'

const maxPrimaryContactMethods = 3

const contactMethods = [
  {
    key: 'com.twitter',
    label: 'Twitter',
    placeholder: 'Twitter',
    section: 'social',
  },
  {
    key: 'org.telegram',
    label: 'Telegram',
    placeholder: 'Telegram',
    section: 'social',
  },
  {
    key: 'xyz.farcaster',
    label: 'Farcaster',
    placeholder: 'Farcaster',
    section: 'social',
  },
  {
    key: 'com.discord',
    label: 'Discord',
    placeholder: 'Discord',
    section: 'social',
  },
  {
    key: 'com.instagram',
    label: 'Instagram',
    placeholder: 'Instagram',
    section: 'social',
  },
  {
    key: 'com.linkedin',
    label: 'LinkedIn',
    placeholder: 'LinkedIn',
    section: 'social',
  },
  {
    key: 'com.github',
    label: 'GitHub',
    placeholder: 'GitHub',
    section: 'social',
  },
  {
    key: 'com.mastodon',
    label: 'Mastodon',
    placeholder: 'Mastodon',
    section: 'social',
  },
  {
    key: 'com.reddit',
    label: 'Reddit',
    placeholder: 'Reddit',
    section: 'social',
  },
  {
    key: 'com.tiktok',
    label: 'TikTok',
    placeholder: 'TikTok',
    section: 'social',
  },
  {
    key: 'com.twitch',
    label: 'Twitch',
    placeholder: 'Twitch',
    section: 'social',
  },
  {
    key: 'email',
    label: 'E-mail',
    placeholder: 'myemail@me.com',
    section: 'contact',
    type: 'email',
  },
  {
    key: 'phone',
    label: 'Phone',
    placeholder: 'Phone',
    section: 'contact',
    type: 'tel',
  },
  {
    key: 'mail',
    label: 'Address',
    placeholder: 'Address',
    section: 'contact',
  },
] as const satisfies readonly {
  readonly key: string
  readonly label: string
  readonly placeholder: string
  readonly section: 'contact' | 'social'
  readonly type?: React.HTMLInputTypeAttribute
}[]

type ContactMethod = (typeof contactMethods)[number]
type ContactMethodKey = ContactMethod['key']

const defaultEnabledContactMethodKeys = new Set<ContactMethodKey>([
  'com.twitter',
  'email',
  'mail',
])

const rowMethodKeys = [
  'email',
  'com.twitter',
  'org.telegram',
  'xyz.farcaster',
  'com.discord',
  'com.instagram',
  'com.linkedin',
  'mail',
  'phone',
  'com.github',
  'com.mastodon',
  'com.reddit',
  'com.tiktok',
  'com.twitch',
] as const satisfies readonly ContactMethodKey[]

const contactMethodByKey = new Map(
  contactMethods.map((method) => [method.key, method]),
)

const rowMethods = rowMethodKeys.flatMap((key) => {
  const method = contactMethodByKey.get(key)
  return method ? [method] : []
})

const getRecordsForMethod = (
  values: ProfileRecords,
  method: ContactMethod,
): TextRecordValue[] => values[method.section]

const hasRecord = (values: ProfileRecords, method: ContactMethod): boolean =>
  getRecordsForMethod(values, method).some(
    (record) => record.key === method.key,
  )

const getRecordValue = (
  values: ProfileRecords,
  method: ContactMethod,
): string =>
  getRecordsForMethod(values, method).find(
    (record) => record.key === method.key,
  )?.value ?? ''

const upsertRecordValue = (
  records: readonly TextRecordValue[],
  key: string,
  value: string,
): TextRecordValue[] =>
  records.some((record) => record.key === key)
    ? records.map((record) =>
        record.key === key ? { ...record, value } : record,
      )
    : [...records, { key, value }]

const removeRecord = (
  records: readonly TextRecordValue[],
  key: string,
): TextRecordValue[] => records.filter((record) => record.key !== key)

const getInitialPrimaryKeys = (
  values: ProfileRecords,
): readonly ContactMethodKey[] =>
  rowMethods
    .filter(
      (method) =>
        hasRecord(values, method) && getRecordValue(values, method).trim(),
    )
    .slice(0, 1)
    .map(({ key }) => key)

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

interface ContactMethodRowProps {
  readonly disabled: boolean
  readonly method: ContactMethod
  readonly onPrimaryChange: (method: ContactMethod, checked: boolean) => void
  readonly onValueChange: (method: ContactMethod, value: string) => void
  readonly primary: boolean
  readonly primaryDisabled: boolean
  readonly value: string
}

const ContactMethodRow = ({
  disabled,
  method,
  onPrimaryChange,
  onValueChange,
  primary,
  primaryDisabled,
  value,
}: ContactMethodRowProps) => {
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

interface EditProfileContactTabProps {
  readonly errorMessage?: string
  readonly isSaving: boolean
  readonly isSuccess: boolean
  readonly onContactChange: (contact: ProfileRecords['contact']) => void
  readonly onSocialChange: (social: ProfileRecords['social']) => void
  readonly txHash?: string
  readonly values: ProfileRecords
}

export const EditProfileContactTab = ({
  errorMessage,
  isSaving,
  isSuccess,
  onContactChange,
  onSocialChange,
  txHash,
  values,
}: EditProfileContactTabProps) => {
  const [primaryKeys, setPrimaryKeys] = useState<Set<ContactMethodKey>>(
    () => new Set(getInitialPrimaryKeys(values)),
  )
  const [disabledDefaultMethodKeys, setDisabledDefaultMethodKeys] = useState<
    Set<ContactMethodKey>
  >(() => new Set())

  const isDefaultEnabledMethod = (method: ContactMethod) =>
    defaultEnabledContactMethodKeys.has(method.key) &&
    !disabledDefaultMethodKeys.has(method.key)
  const isMethodEnabled = (method: ContactMethod) =>
    hasRecord(values, method) || isDefaultEnabledMethod(method)

  const selectedMethods = rowMethods.filter((method) => isMethodEnabled(method))
  const selectedKeySignature = selectedMethods.map(({ key }) => key).join('|')

  useEffect(() => {
    const selectedKeys = new Set<ContactMethodKey>(
      selectedKeySignature
        ? (selectedKeySignature.split('|') as ContactMethodKey[])
        : [],
    )
    setPrimaryKeys(
      (current) => new Set([...current].filter((key) => selectedKeys.has(key))),
    )
  }, [selectedKeySignature])

  const updateRecords = (method: ContactMethod, records: TextRecordValue[]) => {
    if (method.section === 'contact') {
      onContactChange(records)
      return
    }

    onSocialChange(records)
  }

  const handlePickerToggle = (method: ContactMethod) => {
    const records = getRecordsForMethod(values, method)
    const defaultEnabled = defaultEnabledContactMethodKeys.has(method.key)

    if (isMethodEnabled(method)) {
      if (hasRecord(values, method)) {
        updateRecords(method, removeRecord(records, method.key))
      }

      if (defaultEnabled) {
        setDisabledDefaultMethodKeys((current) => {
          const next = new Set(current)
          next.add(method.key)
          return next
        })
      }

      setPrimaryKeys((current) => {
        const next = new Set(current)
        next.delete(method.key)
        return next
      })
      return
    }

    if (defaultEnabled) {
      setDisabledDefaultMethodKeys((current) => {
        const next = new Set(current)
        next.delete(method.key)
        return next
      })
      return
    }

    updateRecords(method, upsertRecordValue(records, method.key, ''))
  }

  const handleValueChange = (method: ContactMethod, value: string) => {
    const records = getRecordsForMethod(values, method)
    updateRecords(method, upsertRecordValue(records, method.key, value))
  }

  const handlePrimaryChange = (method: ContactMethod, checked: boolean) => {
    setPrimaryKeys((current) => {
      const next = new Set(current)

      if (!checked) {
        next.delete(method.key)
        return next
      }

      if (next.size >= maxPrimaryContactMethods) {
        return next
      }

      next.add(method.key)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex flex-col gap-1.5">
        <p className="font-bold font-sans text-[#525252] text-[16px] leading-[0.96] tracking-[-0.32px]">
          Contact and Social
        </p>
        <p className="text-[16px] text-ens-quartz-400 leading-[1.2]">
          Add the places people can find or reach you. Toggle up to 3 as your
          primary contact methods - these get pinned to the top of your profile.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {contactMethods.map((method) => {
          const active = isMethodEnabled(method)
          const record = getRecordDef(method.key)

          return (
            <EditProfileFieldPickerPill
              active={active}
              disabled={isSaving}
              icon={
                <IconRenderer
                  className="size-3 shrink-0 text-current"
                  icon={record?.icon}
                />
              }
              key={method.key}
              label={method.label}
              onClick={() => handlePickerToggle(method)}
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

      <div className="flex flex-col gap-3 overflow-hidden">
        <p className="w-full text-right text-[12px] text-ens-signal-success-700 leading-[1.2]">
          {primaryKeys.size}/{maxPrimaryContactMethods} selected
        </p>

        {selectedMethods.length === 0 ? (
          <div className="rounded-sm border border-ens-quartz-250 border-dashed p-4 text-[14px] text-ens-quartz-400">
            Select a contact method to add it to your profile.
          </div>
        ) : (
          selectedMethods.map((method) => (
            <div className="flex flex-col gap-3" key={method.key}>
              <ContactMethodRow
                disabled={isSaving}
                method={method}
                onPrimaryChange={handlePrimaryChange}
                onValueChange={handleValueChange}
                primary={primaryKeys.has(method.key)}
                primaryDisabled={
                  !primaryKeys.has(method.key) &&
                  primaryKeys.size >= maxPrimaryContactMethods
                }
                value={getRecordValue(values, method)}
              />
              {method.key === 'email' ? (
                <p className="text-[16px] text-black leading-[1.2]">
                  Your contact information is publicly viewable on your profile.
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
