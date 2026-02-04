import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AddTextRecordsDialog } from '@/features/profile/components/dialogs/AddTextRecordsDialog'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import { getAvailableRecords, getRecordDef } from '../../data/records'

export const SocialLinksSection = withForm({
  ...sharedOptions,
  render: ({ form }) => (
    <Card className="border-[0.25px] border-border bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-base tracking-tight">Social Links</CardTitle>
        <CardDescription className="text-base">
          Add your social media profiles to your profile
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form.Field mode="array" name="social">
          {(socialField) => (
            <>
              {socialField.state.value.map(({ key }, i: number) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Recommended by TanStack Form
                <form.Field key={i} name={`social[${i}].value`}>
                  {(field) => {
                    const record = getRecordDef(key)
                    if (!record) return null
                    return (
                      <RecordEntry
                        name={record.name}
                        onChange={field.handleChange}
                        onRemove={() => {
                          socialField.removeValue(i)
                        }}
                        placeholder={record.placeholder}
                        value={field.state.value}
                      />
                    )
                  }}
                </form.Field>
              ))}
              <AddTextRecordsDialog
                buttonLabel="Add more"
                onAdd={(keys) => {
                  for (const key of keys) {
                    socialField.pushValue({ key, value: '' })
                  }
                }}
                records={getAvailableRecords(
                  socialField.state.value.map(({ key }) => key),
                  'social',
                )}
                title="Add Social Link"
              />
            </>
          )}
        </form.Field>
      </CardContent>
    </Card>
  ),
})
