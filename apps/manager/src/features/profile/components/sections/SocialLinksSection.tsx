import { AddTextRecordsDialog } from '@/features/profile/components/dialogs/AddTextRecordsDialog'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import {
  getAvailableSocialRecords,
  getSocialRecord,
} from '@/features/profile/data/records'

export const SocialLinksSection = withForm({
  ...sharedOptions,
  render: ({ form }) => (
    <form.Field name="social" mode="array">
      {(socialField) => (
        <div className="space-y-2">
          <h3>Social Links</h3>
          {socialField.state.value.map(({ key }, i: number) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Recommended by TanStack Form
            <form.Field key={i} name={`social[${i}].value`}>
              {(field) => {
                const record = getSocialRecord(key)
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
                      socialField.removeValue(i)
                    }}
                  />
                )
              }}
            </form.Field>
          ))}
          <AddTextRecordsDialog
            buttonLabel="Add Social Link"
            title="Add Social Link"
            records={getAvailableSocialRecords(
              socialField.state.value.map(({ key }) => key),
            )}
            onAdd={(keys) => {
              keys.forEach((key) => {
                socialField.pushValue({ key, value: '' })
              })
            }}
          />
        </div>
      )}
    </form.Field>
  ),
})
