import { useQuery } from '@tanstack/react-query'
import { profileRecordsQuery } from '../service/profileRecords'
import {
  defaultProfileRecords,
  transformProfileRecords,
} from '../utils/transformRecords'
import { DiffDialog } from './dialogs/DiffDialog'
import { useAppForm } from './form'
import { BioSection } from './sections/BioSection'
import { CryptoAddressesSection } from './sections/CryptoAddressesSection'
import { HeaderSection } from './sections/HeaderSection'
import { LinksSection } from './sections/LinksSection'
import { SocialLinksSection } from './sections/SocialLinksSection'

interface ProfileEditProps {
  name: string
}

export const ProfileEdit = ({ name }: ProfileEditProps) => {
  const {
    data: recordsData,
    isLoading,
    error,
  } = useQuery({
    ...profileRecordsQuery(name),
    select: transformProfileRecords,
  })

  const defaultValues = recordsData ?? defaultProfileRecords

  const form = useAppForm({
    defaultValues,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    form.handleSubmit()
  }

  const handleSave = () => {
    // TODO: Implement actual save logic
    console.log('Saving changes:', form.state.values)
    // Here you would typically call an API to save the changes
  }

  const handleCancel = () => {
    // Reset form to original values
    form.reset()
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-600">Loading profile...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center justify-center py-8">
          <div className="text-red-600">
            Error loading profile: {error.message}
          </div>
        </div>
      </div>
    )
  }

  return (
    <form className="mx-auto max-w-md space-y-4" onSubmit={handleSubmit}>
      <HeaderSection form={form} name={name} />
      <BioSection form={form} />

      {/* Divider */}
      <div className="h-px w-full bg-gray-200" />

      <SocialLinksSection form={form} />
      <CryptoAddressesSection form={form} />

      <LinksSection form={form} />

      {/* Save Button */}
      <div className="pt-4">
        <form.Subscribe selector={(state) => state.values}>
          {(currentData) => (
            <DiffDialog
              originalData={defaultValues}
              currentData={currentData}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}
