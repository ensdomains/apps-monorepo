import { TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ProfileRecords } from '../../types'
import {
  EditProfileGeneralTab,
  type GeneralField,
} from './EditProfileGeneralTab'

const tabs = [
  { label: 'General', value: 'general' },
  { label: 'Contact', value: 'contact' },
  { label: 'Addresses', value: 'addresses' },
  { label: 'Links', value: 'links' },
  { label: 'Appearance', value: 'appearance' },
] as const

interface EditProfileDialogTabsProps {
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

export const EditProfileDialogTabs = ({
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
          errorMessage={errorMessage}
          isSaving={isSaving}
          isSuccess={isSuccess}
          name={name}
          onBaseChange={onBaseChange}
          onContactChange={onContactChange}
          onToggleField={onToggleField}
          txHash={txHash}
          values={values}
          visibleFields={visibleFields}
        />
      </TabsContent>

      {tabs
        .filter(({ value }) => value !== 'general')
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
