import { Button } from '@/components/ui/button'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import { sharedOptions, withForm } from '@/features/profile/components/form'

export const LinksSection = withForm({
  ...sharedOptions,
  render: ({ form }) => (
    <form.Field name="links" mode="array">
      {(linksField) => (
        <div className="space-y-2">
          <h3>Links</h3>
          {linksField.state.value.map(({ name }, i: number) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Recommended by TanStack Form
            <form.Field key={i} name={`links[${i}].url`}>
              {(field) => {
                return (
                  <RecordEntry
                    name={name}
                    placeholder="https://example.com"
                    value={field.state.value}
                    onChange={(value) => {
                      field.handleChange(value)
                    }}
                    onRemove={() => {
                      linksField.removeValue(i)
                    }}
                  />
                )
              }}
            </form.Field>
          ))}
          <Button
            onClick={() => {
              // ask for link name
              const name = prompt('Enter link name')
              if (name) {
                linksField.pushValue({ name, url: '' })
              }
            }}
          >
            Add Link
          </Button>
        </div>
      )}
    </form.Field>
  ),
})
