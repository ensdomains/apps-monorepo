import { useMemo } from 'react'
import { getProfileRecords, transformProfileRecords } from '../MOCK'
import { useAppForm } from './form'
import { BioSection } from './sections/BioSection'
import { CryptoAddressesSection } from './sections/CryptoAddressesSection'
import { HeaderSection } from './sections/HeaderSection'
import { LinksSection } from './sections/LinksSection'
import { SocialLinksSection } from './sections/SocialLinksSection'
import { DiffDialog } from './dialogs/DiffDialog'

// Main Component
export const Main = ({ name }: { name: string }) => {
  const originalData = useMemo(
    () => transformProfileRecords(getProfileRecords(name)),
    [name],
  )
  const form = useAppForm({
    defaultValues: originalData,
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
    // form.reset()
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
              originalData={originalData}
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