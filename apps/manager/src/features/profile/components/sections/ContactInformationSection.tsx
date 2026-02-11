import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AddTextRecordsDialog } from '@/features/profile/components/dialogs/AddTextRecordsDialog'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import { getAvailableRecords, getRecordDef } from '../../data/records'

export const ContactInformationSection = withForm({
  ...sharedOptions,
  render: ({ form }) => (
    <Card className="border-[0.25px] border-border bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-base tracking-tight">
          Contact Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form.Field mode="array" name="contact">
          {(contactField) => (
            <>
              {contactField.state.value.map(
                ({ key }: { key: string }, i: number) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Recommended by TanStack Form
                  <form.Field key={i} name={`contact[${i}].value`}>
                    {(field) => {
                      const record = getRecordDef(key)
                      if (!record) return null
                      return (
                        <RecordEntry
                          name={record.name}
                          onChange={field.handleChange}
                          onRemove={() => {
                            contactField.removeValue(i)
                          }}
                          placeholder={record.placeholder}
                          value={field.state.value}
                        />
                      )
                    }}
                  </form.Field>
                ),
              )}
              <AddTextRecordsDialog
                buttonLabel="Add more"
                onAdd={(keys) => {
                  for (const key of keys) {
                    contactField.pushValue({ key, value: '' })
                  }
                }}
                records={getAvailableRecords(
                  contactField.state.value.map(
                    ({ key }: { key: string }) => key,
                  ),
                  'contact',
                )}
                title="Add Contact Information"
              />
            </>
          )}
        </form.Field>
      </CardContent>
    </Card>
  ),
})
