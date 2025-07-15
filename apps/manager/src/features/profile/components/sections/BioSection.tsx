import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { AddTextRecordsDialog } from '@/features/profile/components/dialogs/AddTextRecordsDialog'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import {
  getAvailableContactRecords,
  getContactRecord,
} from '@/features/profile/data/records'

export const BioSection = withForm({
  ...sharedOptions,
  render: ({ form }) => (
    <div className="flex flex-col gap-2 space-y-2">
      <div>
        <form.Field name="bio.description">
          {(field) => (
            <>
              <div className="flex items-center justify-between">
                <span className="font-medium">Bio</span>
                <button type="button" onClick={() => field.handleChange('')}>
                  <X className="size-4" />
                </button>
              </div>
              <Input
                className="w-full"
                placeholder="add a bio to your profile"
                value={field.state.value}
                onChange={(e) => {
                  field.handleChange(e.target.value)
                }}
              />
            </>
          )}
        </form.Field>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <span className="font-medium">Add a link to bio</span>
          <form.Field name="bio.url">
            {(field) => (
              <>
                <Input
                  className="w-full"
                  placeholder="https://example.com"
                  value={field.state.value}
                  onChange={(e) => {
                    field.handleChange(e.target.value)
                  }}
                />
                <button type="button" className="ml-auto">
                  <X className="size-4" />
                </button>
              </>
            )}
          </form.Field>
        </div>
      </div>

      <form.Field name="contacts" mode="array">
        {(contactField) => (
          <div className="space-y-2">
            {contactField.state.value.map(
              ({ key }: { key: string }, i: number) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Recommended by TanStack Form
                <form.Field key={i} name={`contacts[${i}].value`}>
                  {(field) => {
                    const record = getContactRecord(key)
                    if (!record) return null
                    return (
                      <RecordEntry
                        name={record.name}
                        placeholder={record.placeholder}
                        value={field.state.value}
                        onChange={(value) => {
                          field.handleChange(value)
                        }}
                        onRemove={() => {
                          contactField.removeValue(i)
                        }}
                      />
                    )
                  }}
                </form.Field>
              ),
            )}
            <AddTextRecordsDialog
              buttonLabel="Add Contact Information"
              title="Add Contact Information"
              records={getAvailableContactRecords(
                contactField.state.value.map(({ key }: { key: string }) => key),
              )}
              onAdd={(keys) => {
                keys.forEach((key) => {
                  contactField.pushValue({ key, value: '' })
                })
              }}
            />
          </div>
        )}
      </form.Field>
    </div>
  ),
})
