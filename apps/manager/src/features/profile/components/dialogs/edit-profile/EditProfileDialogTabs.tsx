import type { Address } from 'viem'
import { TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ProfileRecords } from '../../../types'
import { AddressesTab } from './tabs/addresses/AddressesTab'
import { AppearanceTab } from './tabs/appearance/AppearanceTab'
import { ContactTab } from './tabs/contact/ContactTab'
import { GeneralTab } from './tabs/general/GeneralTab'
import { LinksTab } from './tabs/links/LinksTab'

const tabs = [
  { label: 'General', value: 'general' },
  { label: 'Contact', value: 'contact' },
  { label: 'Addresses', value: 'addresses' },
  { label: 'Links', value: 'links' },
  { label: 'Appearance', value: 'appearance' },
] as const

interface EditProfileDialogTabsProps {
  readonly name: string
  readonly onAddressesChange: (addresses: ProfileRecords['addresses']) => void
  readonly onBaseChange: (base: ProfileRecords['base']) => void
  readonly onContactChange: (contact: ProfileRecords['contact']) => void
  readonly onDraftLinkValidationIssuesChange: (
    hasValidationIssues: boolean,
  ) => void
  readonly onLinksChange: (links: ProfileRecords['links']) => void
  readonly onSocialChange: (social: ProfileRecords['social']) => void
  readonly owner?: Address
  readonly values: ProfileRecords
}

export const EditProfileDialogTabs = ({
  name,
  onAddressesChange,
  onBaseChange,
  onContactChange,
  onDraftLinkValidationIssuesChange,
  onLinksChange,
  onSocialChange,
  owner,
  values,
}: EditProfileDialogTabsProps) => {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="shrink-0 pb-5 pl-4">
        <TabsList className="flex h-full w-[118px] flex-col items-stretch justify-start gap-0.5 rounded-none border-ens-quartz-200 border-r bg-white p-2">
          {tabs.map(({ label, value }) => (
            <TabsTrigger
              className="h-10 w-full flex-none justify-start whitespace-nowrap rounded-lg p-3 font-normal text-[14px] text-ens-quartz-500 tracking-[0.14px] data-[state=active]:bg-[#f2f2f2] data-[state=active]:text-ens-quartz-500"
              key={value}
              value={value}
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-4 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabsContent className="min-h-0 flex-1" value="general">
          <GeneralTab
            name={name}
            onBaseChange={onBaseChange}
            onContactChange={onContactChange}
            values={values}
          />
        </TabsContent>

        <TabsContent className="min-h-0 flex-1" value="contact">
          <ContactTab
            onBaseChange={onBaseChange}
            onContactChange={onContactChange}
            onSocialChange={onSocialChange}
            values={values}
          />
        </TabsContent>

        <TabsContent className="min-h-0 flex-1" value="addresses">
          <AddressesTab onAddressesChange={onAddressesChange} values={values} />
        </TabsContent>

        <TabsContent className="min-h-0 flex-1" forceMount value="links">
          <LinksTab
            onDraftValidationIssuesChange={onDraftLinkValidationIssuesChange}
            onLinksChange={onLinksChange}
            values={values}
          />
        </TabsContent>

        <TabsContent className="min-h-0 flex-1" value="appearance">
          <AppearanceTab
            name={name}
            onBaseChange={onBaseChange}
            owner={owner}
            values={values}
          />
        </TabsContent>
      </div>
    </div>
  )
}
