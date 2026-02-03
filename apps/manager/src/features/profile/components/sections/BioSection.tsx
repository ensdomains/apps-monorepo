import { X } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FloatingTextarea } from '@/components/ui/floating-textarea'
import { AddTextRecordsDialog } from '@/features/profile/components/dialogs/AddTextRecordsDialog'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import { getAvailableRecords, getRecordDef } from '../../data/records'

export const BioSection = withForm({
  ...sharedOptions,
  render: ({ form }) => (
    <Card className="border-[0.25px] border-border bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-base tracking-tight">Bio</CardTitle>
        <CardDescription className="text-base">
          Add a bio to your profile
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form.Field name="base.description">
          {(field) => (
            <div className="flex items-start gap-3 pt-1">
              <FloatingTextarea
                className="flex-1"
                label="Short Description"
                onChange={(e) => {
                  field.handleChange(e.target.value)
                }}
                placeholder="Add a short bio to your profile"
                value={field.state.value}
              />
              <button
                className="mt-5 text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => field.handleChange('')}
                type="button"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
        </form.Field>

        <form.Field name="base.url">
          {(field) => (
            <RecordEntry
              name="website"
              onChange={field.handleChange}
              onRemove={() => field.handleChange('')}
              placeholder="https://"
              value={field.state.value}
            />
          )}
        </form.Field>

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
