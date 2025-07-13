import { socialRecords } from '@/features/profile/data/records'
import { AddTextRecordsDialog } from '@/features/profile/components/dialogs/AddTextRecordsDialog'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import { sharedOptions, withForm } from '@/features/profile/components/form'

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
                const record = socialRecords.find(
                  (record) => record.key === key,
                )
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
            records={socialRecords.filter(
              (record) =>
                !socialField.state.value.some(({ key }) => key === record.key),
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
