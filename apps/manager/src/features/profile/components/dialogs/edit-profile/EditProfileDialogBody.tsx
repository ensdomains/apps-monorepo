import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { Tabs } from '@/components/ui/tabs'
import { getActiveSignedProfileImageUploads } from '@/features/profile/service/profileImageCache'
import type { PreparedProfileImageUpload } from '@/features/profile/service/profileImageUpload'
import type { ProfileRecords } from '@/features/profile/types'
import { createDiff } from '@/features/profile/utils/createDiff'
import {
  defaultProfileRecords,
  normalizeProfileRecords,
} from '@/features/profile/utils/transformRecords'
import { sharedOptions, withForm } from '../../form'
import type { EditProfileSaveHandler } from './EditProfileDialog.types'
import { EditProfileDialogFooter } from './EditProfileDialogFooter'
import { EditProfileDialogHeader } from './EditProfileDialogHeader'
import { EditProfileDialogTabs, editProfileTabs } from './EditProfileDialogTabs'
import { getAddressValidationIssues } from './tabs/addresses/AddressesTab.helpers'
import { getContactValidationIssues } from './tabs/contact/records'
import {
  getGeneralValidationIssues,
  isDescriptionOverLimit,
} from './tabs/general/fields'
import { getLinkValidationIssues } from './tabs/links/validation'

interface EditProfileDialogBodyProps {
  readonly isFinalizingImageSave: boolean
  readonly isResolverAccessPending: boolean
  readonly name: string
  readonly onCancel: () => void
  readonly onPreview: EditProfileSaveHandler
  readonly onImageUploadPrepared: (upload: PreparedProfileImageUpload) => void
  readonly open: boolean
  readonly owner?: Address
  readonly savedRecords: ProfileRecords
  readonly preparedImageUploads: readonly PreparedProfileImageUpload[]
}

export const EditProfileDialogBody = withForm({
  ...sharedOptions,
  props: {
    isFinalizingImageSave: false,
    isResolverAccessPending: false,
    name: '',
    onCancel: () => {},
    onPreview: () => {},
    onImageUploadPrepared: () => {},
    open: false,
    preparedImageUploads: [],
    savedRecords: defaultProfileRecords,
  } as EditProfileDialogBodyProps,
  render: ({
    form,
    isFinalizingImageSave,
    isResolverAccessPending,
    name,
    onCancel,
    onPreview,
    onImageUploadPrepared,
    open,
    owner,
    preparedImageUploads,
    savedRecords,
  }) => {
    const [activeTab, setActiveTab] = useState('general')
    const [mobileNavOpen, setMobileNavOpen] = useState(false)
    const [hasDraftLinkValidationIssues, setHasDraftLinkValidationIssues] =
      useState(false)

    // biome-ignore lint/correctness/useExhaustiveDependencies: reset draft link validation whenever the dialog open state changes
    useEffect(() => {
      setHasDraftLinkValidationIssues(false)
      setActiveTab('general')
      setMobileNavOpen(false)
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
          const activePreparedImageUploads = getActiveSignedProfileImageUploads(
            {
              images: preparedImageUploads,
              records: submittedValues,
            },
          )
          const activePreparedAvatarPreviewUrl =
            activePreparedImageUploads.find(
              ({ kind }) => kind === 'avatar',
            )?.dataURL
          const hasPreparedImageUpload = activePreparedImageUploads.length > 0
          const hasAddressValidationIssues =
            getAddressValidationIssues(values.addresses).length > 0
          const hasLinkValidationIssues =
            getLinkValidationIssues(values.links).length > 0 ||
            hasDraftLinkValidationIssues
          const hasContactValidationIssues =
            getContactValidationIssues(values).length > 0
          const hasGeneralValidationIssues =
            getGeneralValidationIssues(values).length > 0 ||
            isDescriptionOverLimit(
              values.base.description,
              savedRecords.base.description,
            )
          const canPreviewProfile =
            (hasChanges || hasPreparedImageUpload) &&
            canSubmit &&
            !isFinalizingImageSave &&
            !isResolverAccessPending &&
            !hasAddressValidationIssues &&
            !hasGeneralValidationIssues &&
            !hasLinkValidationIssues &&
            !hasContactValidationIssues
          const tabsWithErrors: Record<string, boolean> = {
            addresses: hasAddressValidationIssues,
            contact: hasContactValidationIssues,
            general: hasGeneralValidationIssues,
            links: hasLinkValidationIssues,
          }
          const errorTabs = editProfileTabs.filter(
            ({ value }) => tabsWithErrors[value],
          )
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
          const handlePreview = () => {
            if (!canPreviewProfile) return

            onPreview(submittedValues, {
              hasRecordChanges: hasChanges,
              preparedImageUploads: activePreparedImageUploads,
            })
          }

          return (
            <Tabs
              className="h-full min-h-0 flex-1 gap-0 overflow-hidden"
              onValueChange={setActiveTab}
              orientation="vertical"
              value={activeTab}
            >
              <EditProfileDialogHeader
                avatarPreviewUrl={activePreparedAvatarPreviewUrl}
                avatarUrl={values.base.avatar}
                name={name}
                themeColor={values.base.theme}
              />
              <EditProfileDialogTabs
                mobileNavOpen={mobileNavOpen}
                name={name}
                onAddressesChange={handleAddressesChange}
                onBaseChange={handleBaseChange}
                onContactChange={handleContactChange}
                onDraftLinkValidationIssuesChange={
                  setHasDraftLinkValidationIssues
                }
                onImageUploadPrepared={onImageUploadPrepared}
                onLinksChange={handleLinksChange}
                onMobileNavOpenChange={setMobileNavOpen}
                onSocialChange={handleSocialChange}
                owner={owner}
                preparedImageUploads={activePreparedImageUploads}
                savedDescription={savedRecords.base.description}
                values={values}
              />
              <EditProfileDialogFooter
                canPreview={canPreviewProfile}
                errorTabLabels={errorTabs.map(({ label }) => label)}
                hasChanges={hasChanges || hasPreparedImageUpload}
                onCancel={onCancel}
                onPreview={handlePreview}
                onShowErrors={() => {
                  const [firstErrorTab] = errorTabs
                  if (!firstErrorTab) return

                  setActiveTab(firstErrorTab.value)
                  setMobileNavOpen(false)
                }}
              />
            </Tabs>
          )
        }}
      </form.Subscribe>
    )
  },
})
