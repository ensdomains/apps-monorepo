import { AnimatePresence } from 'motion/react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import { validateUrl } from '@/features/profile/utils/validateUrl'
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
              <AnimatePresence mode="popLayout">
                {linksField.state.value.map(({ name }, i: number) => (
                  <form.Field
                    key={name}
                    name={`links[${i}].url`}
                    validators={{
                      onBlur: ({ value }) => validateUrl(value),
                    }}
                  >
                    {(field) => {
                      return (
                        <RecordEntry
                          error={
                            field.state.meta.isTouched &&
                            field.state.meta.errors.length > 0
                              ? field.state.meta.errors[0]
                              : undefined
                          }
                          name={name}
                          onBlur={field.handleBlur}
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
              </AnimatePresence>
              <AddLinkDialog
                onAdd={(link) => {
                  linksField.pushValue(link)
                }}
              />
            </>
          )}
        </form.Field>
      </CardContent>
    </Card>
  ),
})
