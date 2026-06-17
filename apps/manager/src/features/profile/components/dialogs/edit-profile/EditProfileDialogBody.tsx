import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { Tabs } from '@/components/ui/tabs'
import {
  getActiveSignedProfileImageUploads,
  type SignedProfileImageUpload,
} from '@/features/profile/service/profileImageCache'
import type { ProfileRecords } from '@/features/profile/types'
import { createDiff } from '@/features/profile/utils/createDiff'
import {
  defaultProfileRecords,
  normalizeProfileRecords,
} from '@/features/profile/utils/transformRecords'
import { sharedOptions, withForm } from '../../form'
import type { EditProfileSaveHandler } from './EditProfileDialog.types'
import { EditProfileDialogHeader } from './EditProfileDialogHeader'
import { EditProfileDialogTabs } from './EditProfileDialogTabs'
import { getAddressValidationIssues } from './tabs/addresses/AddressesTab.helpers'
import { getContactValidationIssues } from './tabs/contact/records'
import type { ProfileImageKind } from './tabs/general/ProfileImageField'
import { getLinkValidationIssues } from './tabs/links/validation'

interface EditProfileDialogBodyProps {
  readonly isFinalizingSignedImageSave: boolean
  readonly name: string
  readonly onSave: EditProfileSaveHandler
  readonly onResetSaveState: () => void
  readonly onSignedImageUploadComplete: (
    kind: ProfileImageKind,
    imageUrl: string,
  ) => void
  readonly open: boolean
  readonly owner?: Address
  readonly savedRecords: ProfileRecords
  readonly signedImageUploads: readonly SignedProfileImageUpload[]
}

export const EditProfileDialogBody = withForm({
  ...sharedOptions,
  props: {
    isFinalizingSignedImageSave: false,
    name: '',
    onResetSaveState: () => {},
    onSave: () => {},
    onSignedImageUploadComplete: () => {},
    open: false,
    savedRecords: defaultProfileRecords,
    signedImageUploads: [],
  } as EditProfileDialogBodyProps,
  render: ({
    form,
    isFinalizingSignedImageSave,
    name,
    onResetSaveState,
    onSave,
    onSignedImageUploadComplete,
    open,
    owner,
    savedRecords,
    signedImageUploads,
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
          const submittedValues = normalizeProfileRecords(values)
          const diff = createDiff(savedRecords, submittedValues)
          const hasChanges = Object.keys(diff).length > 0
          const activeSignedImageUploads = getActiveSignedProfileImageUploads({
            images: signedImageUploads,
            records: submittedValues,
          })
          const hasSignedImageUpload = activeSignedImageUploads.length > 0
          const hasAddressValidationIssues =
            getAddressValidationIssues(values.addresses).length > 0
          const hasLinkValidationIssues =
            getLinkValidationIssues(values.links).length > 0 ||
            hasDraftLinkValidationIssues
          const hasContactValidationIssues =
            getContactValidationIssues(values).length > 0
          const canSaveProfile =
            (hasChanges || hasSignedImageUpload) &&
            canSubmit &&
            !isFinalizingSignedImageSave &&
            !hasAddressValidationIssues &&
            !hasLinkValidationIssues &&
            !hasContactValidationIssues
          const handleBaseChange = (base: ProfileRecords['base']) => {
            onResetSaveState()
            form.setFieldValue('base', base)
          }
          const handleAddressesChange = (
            addresses: ProfileRecords['addresses'],
          ) => {
            onResetSaveState()
            form.setFieldValue('addresses', addresses)
          }
          const handleContactChange = (contact: ProfileRecords['contact']) => {
            onResetSaveState()
            form.setFieldValue('contact', contact)
          }
          const handleSocialChange = (social: ProfileRecords['social']) => {
            onResetSaveState()
            form.setFieldValue('social', social)
          }
          const handleLinksChange = (links: ProfileRecords['links']) => {
            onResetSaveState()
            form.setFieldValue('links', links)
          }
          const handleSave = () =>
            onSave(submittedValues, {
              hasRecordChanges: hasChanges,
              signedImageUploads: activeSignedImageUploads,
            })

          return (
            <Tabs
              className="h-full min-h-0 flex-1 gap-0 overflow-hidden"
              defaultValue="general"
              orientation="vertical"
            >
              <EditProfileDialogHeader
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
                onImageUploadComplete={onSignedImageUploadComplete}
                onLinksChange={handleLinksChange}
                onSave={handleSave}
                onSocialChange={handleSocialChange}
                owner={owner}
                values={values}
              />
            </Tabs>
          )
        }}
      </form.Subscribe>
    )
  },
})
