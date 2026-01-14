import { sharedOptions, withForm } from '@/features/profile/components/form'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import { AddLinkDialog } from '../dialogs/AddLinkDialog'

export const LinksSection = withForm({
  ...sharedOptions,
  render: ({ form }) => (
    <form.Field mode="array" name="links">
      {(linksField) => (
        <div className="space-y-2">
          <h3 className="font-medium">Links</h3>
          {linksField.state.value.map(({ name }, i: number) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Recommended by TanStack Form
            <form.Field key={i} name={`links[${i}].url`}>
              {(field) => {
                return (
                  <RecordEntry
                    name={name}
                    onChange={field.handleChange}
                    onRemove={() => {
                      linksField.removeValue(i)
                    }}
                    placeholder="https://example.com"
                    value={field.state.value}
                  />
                )
              }}
            </form.Field>
          ))}
          <div className="mt-3 flex justify-end">
            <AddLinkDialog
              buttonLabel="Add Link"
              onAdd={(link) => {
                linksField.pushValue(link)
              }}
              title="Add Link"
            />
          </div>
        </div>
      )}
    </form.Field>
  ),
})
