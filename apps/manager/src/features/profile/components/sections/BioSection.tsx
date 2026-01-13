import { X } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { AddTextRecordsDialog } from '@/features/profile/components/dialogs/AddTextRecordsDialog'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import { getAvailableRecords, getRecordDef } from '../../data/records'

export const BioSection = withForm({
  ...sharedOptions,
  render: ({ form }) => (
    <div className="flex flex-col gap-2 space-y-2">
      <div>
        <form.Field name="base.description">
          {(field) => (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">Bio</span>
                <button onClick={() => field.handleChange('')} type="button">
                  <X className="size-4" />
                </button>
              </div>
              <Textarea
                className="w-full"
                onChange={(e) => {
                  field.handleChange(e.target.value)
                }}
                placeholder="Add a short bio to your profile"
                value={field.state.value}
              />
            </div>
          )}
        </form.Field>
      </div>

      <div className="space-y-1">
        <form.Field name="base.url">
          {(field) => (
            <RecordEntry
              name="Add a link to bio"
              onChange={field.handleChange}
              onRemove={() => field.handleChange('')}
              placeholder="https://example.com"
              value={field.state.value}
            />
          )}
        </form.Field>
      </div>

      <form.Field mode="array" name="contact">
        {(contactField) => (
          <div className="space-y-2">
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
            <div className="mt-3 flex justify-end">
              <AddTextRecordsDialog
                buttonLabel="Add Contact Information"
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
            </div>
          </div>
        )}
      </form.Field>
    </div>
  ),
})
