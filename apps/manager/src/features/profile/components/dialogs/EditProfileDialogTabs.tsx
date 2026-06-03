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
  <div className="flex min-h-0 flex-1 px-8 pb-8">
    <TabsList className="h-full w-44 shrink-0 flex-col items-stretch justify-start gap-1 rounded-none border-border border-r bg-transparent p-0 pt-3 pr-4">
      {tabs.map(({ label, value }) => (
        <TabsTrigger
          className="h-12 w-full flex-none justify-start rounded-md px-4 font-normal text-base text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground"
          key={value}
          value={value}
        >
          {label}
        </TabsTrigger>
      ))}
    </TabsList>

    <div className="flex min-w-0 flex-1 flex-col pt-3 pl-8">
      <TabsContent
        className="min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        value="general"
      >
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
