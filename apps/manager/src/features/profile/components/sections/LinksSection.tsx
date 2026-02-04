import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import { AddLinkDialog } from '../dialogs/AddLinkDialog'

export const LinksSection = withForm({
  ...sharedOptions,
  render: ({ form }) => (
    <Card className="border-[0.25px] border-border bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-base tracking-tight">Links</CardTitle>
        <CardDescription className="text-base">
          Add links to your profile
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form.Field mode="array" name="links">
          {(linksField) => (
            <>
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
              <AddLinkDialog
                buttonLabel="Add more"
                onAdd={(link) => {
                  linksField.pushValue(link)
                }}
                title="Add Link"
              />
            </>
          )}
        </form.Field>
      </CardContent>
    </Card>
  ),
})
