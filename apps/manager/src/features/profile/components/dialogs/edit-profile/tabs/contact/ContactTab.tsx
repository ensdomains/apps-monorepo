import { useState } from 'react'
import { IconRenderer } from '@/features/profile/components/IconRenderer'
import { getRecordDef } from '@/features/profile/data/records'
import type { ProfileRecords, TextRecordValue } from '@/features/profile/types'
import { useEditProfileDialogStatus } from '../../EditProfileDialog.context'
import { FieldPickerPill } from '../../shared/FieldPickerPill'
import { ContactMethodRow } from './ContactMethodRow'
import {
  type ContactMethod,
  type ContactMethodKey,
  contactMethods,
  defaultEnabledContactMethodKeys,
  maxPrimaryContactMethods,
  rowMethods,
} from './constants'
import { PrimaryContactCapacityIndicator } from './PrimaryContactCapacityIndicator'
import {
  getBaseWithPrimaryContactKeys,
  getContactMethodErrorMessage,
  getContactMethodNoticeMessage,
  getIsPrimaryContactToggleDisabled,
  getPrimarySocialContactKeys,
  getRecordsForMethod,
  getRecordValue,
  hasRecord,
  removeRecord,
  upsertRecordValue,
} from './records'

interface ContactTabProps {
  readonly onBaseChange: (base: ProfileRecords['base']) => void
  readonly onContactChange: (contact: ProfileRecords['contact']) => void
  readonly onSocialChange: (social: ProfileRecords['social']) => void
  readonly values: ProfileRecords
}

const contactRecordMethods = contactMethods.filter(
  (method) => method.section === 'contact',
)
const socialRecordMethods = contactMethods.filter(
  (method) => method.section === 'social',
)

export const ContactTab = ({
  onBaseChange,
  onContactChange,
  onSocialChange,
  values,
}: ContactTabProps) => {
  const { isSaving } = useEditProfileDialogStatus()
  const [disabledDefaultMethodKeys, setDisabledDefaultMethodKeys] = useState<
    ReadonlySet<ContactMethodKey>
  >(() => new Set())
  const primaryContactKeys = getPrimarySocialContactKeys(values.base)

  const isDefaultEnabledMethod = (method: ContactMethod) =>
    defaultEnabledContactMethodKeys.has(method.key) &&
    !disabledDefaultMethodKeys.has(method.key)
  const isMethodEnabled = (method: ContactMethod) =>
    hasRecord(values, method) || isDefaultEnabledMethod(method)

  const selectedContactMethods = rowMethods.filter(
    (method) => method.section === 'contact' && isMethodEnabled(method),
  )
  const selectedSocialMethods = rowMethods.filter(
    (method) => method.section === 'social' && isMethodEnabled(method),
  )
  const selectedPrimaryContactCount = primaryContactKeys.length

  const updatePrimaryContactKeys = (keys: readonly ContactMethodKey[]) => {
    onBaseChange(getBaseWithPrimaryContactKeys(values.base, keys))
  }

  const removePrimaryContact = (method: ContactMethod) => {
    if (!primaryContactKeys.includes(method.key)) return

    updatePrimaryContactKeys(
      primaryContactKeys.filter((key) => key !== method.key),
    )
  }

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

      removePrimaryContact(method)
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
    if (method.section !== 'social') return

    if (!checked) {
      removePrimaryContact(method)
      return
    }

    if (
      primaryContactKeys.includes(method.key) ||
      primaryContactKeys.length >= maxPrimaryContactMethods
    ) {
      return
    }

    updatePrimaryContactKeys([...primaryContactKeys, method.key])
  }

  return (
    <div className="flex flex-col gap-8 pb-4">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h3 className="font-bold font-sans text-[#525252] text-[16px] leading-[0.96] tracking-[-0.32px]">
            Contact
          </h3>
          <p className="text-[16px] text-ens-quartz-400 leading-[1.2]">
            Add an email, phone number, or mailing address. These always appear
            in Contact on your profile.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {contactRecordMethods.map((method) => {
            const active = isMethodEnabled(method)
            const record = getRecordDef(method.key)

            return (
              <FieldPickerPill
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

        <div className="flex flex-col gap-3">
          {selectedContactMethods.length === 0 ? (
            <div className="rounded-sm border border-ens-quartz-250 border-dashed p-4 text-[14px] text-ens-quartz-400">
              Select a contact method to add it to your profile.
            </div>
          ) : (
            selectedContactMethods.map((method) => {
              const value = getRecordValue(values, method)

              return (
                <ContactMethodRow
                  disabled={isSaving}
                  errorMessage={getContactMethodErrorMessage({
                    isPrimary: false,
                    method,
                    value,
                  })}
                  key={method.key}
                  method={method}
                  noticeMessage={getContactMethodNoticeMessage(method)}
                  onPrimaryChange={handlePrimaryChange}
                  onValueChange={handleValueChange}
                  primary={false}
                  primaryDisabled
                  value={value}
                />
              )
            })
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <h3 className="font-bold font-sans text-[#525252] text-[16px] leading-[0.96] tracking-[-0.32px]">
              Social
            </h3>
            <p className="text-[16px] text-ens-quartz-400 leading-[1.2]">
              Add your social profiles. Star up to 3 to feature them in their
              own section on your profile.
            </p>
          </div>
          <PrimaryContactCapacityIndicator
            maximum={maxPrimaryContactMethods}
            selected={selectedPrimaryContactCount}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {socialRecordMethods.map((method) => {
            const active = isMethodEnabled(method)
            const record = getRecordDef(method.key)

            return (
              <FieldPickerPill
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

        <div className="flex flex-col gap-3">
          {selectedSocialMethods.length === 0 ? (
            <div className="rounded-sm border border-ens-quartz-250 border-dashed p-4 text-[14px] text-ens-quartz-400">
              Select a social profile to add it to your profile.
            </div>
          ) : (
            selectedSocialMethods.map((method) => {
              const value = getRecordValue(values, method)
              const primary = primaryContactKeys.includes(method.key)

              return (
                <ContactMethodRow
                  disabled={isSaving}
                  errorMessage={getContactMethodErrorMessage({
                    isPrimary: primary,
                    method,
                    value,
                  })}
                  key={method.key}
                  method={method}
                  noticeMessage={getContactMethodNoticeMessage(method)}
                  onPrimaryChange={handlePrimaryChange}
                  onValueChange={handleValueChange}
                  primary={primary}
                  primaryDisabled={getIsPrimaryContactToggleDisabled({
                    isPrimary: primary,
                    primaryContactCount: primaryContactKeys.length,
                  })}
                  value={value}
                />
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}
