import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { RecordEntry } from '@/features/profile/components/RecordEntry'

export const LinksSection = withForm({
  ...sharedOptions,
  render: ({ form }) => (
    <form.Field name="links" mode="array">
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
                    placeholder="https://example.com"
                    value={field.state.value}
                    onChange={field.handleChange}
                    onRemove={() => {
                      linksField.removeValue(i)
                    }}
                  />
                )
              }}
            </form.Field>
          ))}
          <div className="mt-3 flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full"
              onClick={() => {
                // ask for link name
                const name = prompt('Enter link name')
                if (name) {
                  linksField.pushValue({ name, url: '' })
                }
              }}
            >
              <Plus className="size-5" />
              Add Link
            </Button>
          </div>
        </div>
      )}
    </form.Field>
  ),
})
