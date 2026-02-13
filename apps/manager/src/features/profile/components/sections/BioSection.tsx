import { X } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FloatingTextarea } from '@/components/ui/floating-textarea'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import { validateUrl } from '@/features/profile/utils/validateUrl'

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
                aria-label="Clear bio"
                className="mt-5 text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => field.handleChange('')}
                type="button"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
        </form.Field>

        <form.Field
          name="base.url"
          validators={{ onBlur: ({ value }) => validateUrl(value) }}
        >
          {(field) => (
            <RecordEntry
              error={
                field.state.meta.isTouched && field.state.meta.errors.length > 0
                  ? field.state.meta.errors[0]
                  : undefined
              }
              name="website"
              onBlur={field.handleBlur}
              onChange={field.handleChange}
              onRemove={() => field.handleChange('')}
              placeholder="https://"
              value={field.state.value}
            />
          )}
        </form.Field>
      </CardContent>
    </Card>
  ),
})
