import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { Tabs } from '@/components/ui/tabs'
import type { PreparedProfileImageUpload } from '@/features/profile/service/profileImageUpload'
import type { ProfileRecords } from '@/features/profile/types'
import { defaultProfileRecords } from '@/features/profile/utils/transformRecords'
import { sharedOptions, withForm } from '../../form'
import type { EditProfileSaveHandler } from './EditProfileDialog.types'
import { getEditProfileDialogDraftState } from './EditProfileDialog.unsavedChanges'
import { EditProfileDialogHeader } from './EditProfileDialogHeader'
import { EditProfileDialogTabs } from './EditProfileDialogTabs'
import { getAddressValidationIssues } from './tabs/addresses/AddressesTab.helpers'
import { getContactValidationIssues } from './tabs/contact/records'
import { getGeneralValidationIssues } from './tabs/general/fields'
import { getLinkValidationIssues } from './tabs/links/validation'

interface EditProfileDialogBodyProps {
  readonly isFinalizingImageSave: boolean
  readonly name: string
  readonly onSave: EditProfileSaveHandler
  readonly onImageUploadPrepared: (upload: PreparedProfileImageUpload) => void
  readonly onUnsavedChangesChange: (hasUnsavedChanges: boolean) => void
  readonly open: boolean
  readonly owner?: Address
  readonly savedRecords: ProfileRecords
  readonly preparedImageUploads: readonly PreparedProfileImageUpload[]
}

interface EditProfileDialogUnsavedChangesReporterProps {
  readonly hasUnsavedChanges: boolean
  readonly onChange: (hasUnsavedChanges: boolean) => void
}

const EditProfileDialogUnsavedChangesReporter = ({
  hasUnsavedChanges,
  onChange,
}: EditProfileDialogUnsavedChangesReporterProps) => {
  useEffect(() => {
    onChange(hasUnsavedChanges)
  }, [hasUnsavedChanges, onChange])

  return null
}

export const EditProfileDialogBody = withForm({
  ...sharedOptions,
  props: {
    isFinalizingImageSave: false,
    name: '',
    onSave: () => {},
    onImageUploadPrepared: () => {},
    onUnsavedChangesChange: () => {},
    open: false,
    preparedImageUploads: [],
    savedRecords: defaultProfileRecords,
  } as EditProfileDialogBodyProps,
  render: ({
    form,
    isFinalizingImageSave,
    name,
    onSave,
    onImageUploadPrepared,
    onUnsavedChangesChange,
    open,
    owner,
    preparedImageUploads,
    savedRecords,
  }) => {
    const [hasDraftLinkValidationIssues, setHasDraftLinkValidationIssues] =
      useState(false)

    // biome-ignore lint/correctness/useExhaustiveDependencies: reset draft link validation whenever the dialog open state changes
    useEffect(() => {
      setHasDraftLinkValidationIssues(false)
    }, [open])

    return (
      <form.Subscribe
        selector={(state) => ({
          canSubmit: state.canSubmit && state.isValid,
          values: state.values,
        })}
      >
        {({ canSubmit, values }) => {
          const {
            activePreparedImageUploads,
            hasPreparedImageUpload,
            hasRecordChanges,
            hasUnsavedChanges,
            submittedValues,
          } = getEditProfileDialogDraftState({
            preparedImageUploads,
            savedRecords,
            values,
          })
          const activePreparedAvatarPreviewUrl =
            activePreparedImageUploads.find(
              ({ kind }) => kind === 'avatar',
            )?.dataURL
          const hasAddressValidationIssues =
            getAddressValidationIssues(values.addresses).length > 0
          const hasLinkValidationIssues =
            getLinkValidationIssues(values.links).length > 0 ||
            hasDraftLinkValidationIssues
          const hasContactValidationIssues =
            getContactValidationIssues(values).length > 0
          const hasGeneralValidationIssues =
            getGeneralValidationIssues(values).length > 0
          const canSaveProfile =
            (hasRecordChanges || hasPreparedImageUpload) &&
            canSubmit &&
            !isFinalizingImageSave &&
            !hasAddressValidationIssues &&
            !hasGeneralValidationIssues &&
            !hasLinkValidationIssues &&
            !hasContactValidationIssues
          const handleBaseChange = (base: ProfileRecords['base']) => {
            form.setFieldValue('base', base)
          }
          const handleAddressesChange = (
            addresses: ProfileRecords['addresses'],
          ) => {
            form.setFieldValue('addresses', addresses)
          }
          const handleContactChange = (contact: ProfileRecords['contact']) => {
            form.setFieldValue('contact', contact)
          }
          const handleSocialChange = (social: ProfileRecords['social']) => {
            form.setFieldValue('social', social)
          }
          const handleLinksChange = (links: ProfileRecords['links']) => {
            form.setFieldValue('links', links)
          }
          const handleSave = () =>
            onSave(submittedValues, {
              hasRecordChanges,
              preparedImageUploads: activePreparedImageUploads,
            })

          return (
            <>
              <EditProfileDialogUnsavedChangesReporter
                hasUnsavedChanges={hasUnsavedChanges}
                onChange={onUnsavedChangesChange}
              />
              <Tabs
                className="h-full min-h-0 flex-1 gap-0 overflow-hidden"
                defaultValue="general"
                orientation="vertical"
              >
                <EditProfileDialogHeader
                  avatarPreviewUrl={activePreparedAvatarPreviewUrl}
                  avatarUrl={values.base.avatar}
                  canSave={canSaveProfile}
                  name={name}
                  onSave={handleSave}
                  themeColor={values.base.theme}
                />
                <EditProfileDialogTabs
                  canSave={canSaveProfile}
                  name={name}
                  onAddressesChange={handleAddressesChange}
                  onBaseChange={handleBaseChange}
                  onContactChange={handleContactChange}
                  onDraftLinkValidationIssuesChange={
                    setHasDraftLinkValidationIssues
                  }
                  onImageUploadPrepared={onImageUploadPrepared}
                  onLinksChange={handleLinksChange}
                  onSave={handleSave}
                  onSocialChange={handleSocialChange}
                  owner={owner}
                  preparedImageUploads={activePreparedImageUploads}
                  values={values}
                />
              </Tabs>
            </>
          )
        }}
      </form.Subscribe>
    )
  },
})
