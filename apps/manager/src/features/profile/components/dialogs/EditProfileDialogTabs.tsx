import type { Address } from 'viem'
import { TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ProfileRecords } from '../../types'
import { EditProfileAppearanceTab } from './EditProfileAppearanceTab'
import { EditProfileContactTab } from './EditProfileContactTab'
import { EditProfileGeneralTab } from './EditProfileGeneralTab'
import { EditProfileLinksTab } from './EditProfileLinksTab'

const tabs = [
  { label: 'General', value: 'general' },
  { label: 'Contact', value: 'contact' },
  { label: 'Addresses', value: 'addresses' },
  { label: 'Links', value: 'links' },
  { label: 'Appearance', value: 'appearance' },
] as const

interface EditProfileDialogTabsProps {
  readonly name: string
  readonly onBaseChange: (base: ProfileRecords['base']) => void
  readonly onContactChange: (contact: ProfileRecords['contact']) => void
  readonly onLinksChange: (links: ProfileRecords['links']) => void
  readonly onSocialChange: (social: ProfileRecords['social']) => void
  readonly owner?: Address
  readonly values: ProfileRecords
}

export const EditProfileDialogTabs = ({
  name,
  onBaseChange,
  onContactChange,
  onLinksChange,
  onSocialChange,
  owner,
  values,
}: EditProfileDialogTabsProps) => (
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
        <EditProfileGeneralTab
          name={name}
          onBaseChange={onBaseChange}
          onContactChange={onContactChange}
          values={values}
        />
      </TabsContent>

      <TabsContent className="min-h-0 flex-1" value="contact">
        <EditProfileContactTab
          onBaseChange={onBaseChange}
          onContactChange={onContactChange}
          onSocialChange={onSocialChange}
          values={values}
        />
      </TabsContent>

      <TabsContent className="min-h-0 flex-1" value="links">
        <EditProfileLinksTab onLinksChange={onLinksChange} values={values} />
      </TabsContent>

      <TabsContent className="min-h-0 flex-1" value="appearance">
        <EditProfileAppearanceTab
          name={name}
          onBaseChange={onBaseChange}
          owner={owner}
          values={values}
        />
      </TabsContent>

      {tabs
        .filter(
          ({ value }) =>
            value !== 'general' &&
            value !== 'contact' &&
            value !== 'links' &&
            value !== 'appearance',
        )
        .map(({ value }) => (
          <TabsContent
            className="flex min-h-0 flex-1 items-center justify-center text-base text-muted-foreground"
            key={value}
            value={value}
          >
            WIP
          </TabsContent>
        ))}
    </div>
  </div>
)
