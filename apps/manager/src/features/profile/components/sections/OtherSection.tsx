import { X } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FloatingInput } from '@/components/ui/floating-input'
import { FloatingTextarea } from '@/components/ui/floating-textarea'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { validateContentHash } from '@/features/profile/utils/validateContentHash'

export const OtherSection = withForm({
  ...sharedOptions,
  render: ({ form }) => (
    <Card className="border-[0.25px] border-border bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-base tracking-tight">Other</CardTitle>
        <CardDescription className="text-base">
          Set the content hash and ABI for your name
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form.Field
          name="contentHash"
          validators={{ onBlur: ({ value }) => validateContentHash(value) }}
        >
          {(field) => (
            <div className="flex flex-col gap-1 pt-1">
              <div className="flex items-center gap-3">
                <FloatingInput
                  aria-invalid={
                    field.state.meta.isTouched &&
                    field.state.meta.errors.length > 0
                  }
                  className="flex-1"
                  label="Content Hash"
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="ipfs://..."
                  value={field.state.value ?? ''}
                />
                <button
                  aria-label="Clear content hash"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => field.handleChange('')}
                  type="button"
                >
                  <X className="size-3" />
                </button>
              </div>
              {field.state.meta.isTouched &&
                field.state.meta.errors.length > 0 && (
                  <p className="text-destructive text-xs">
                    {field.state.meta.errors[0]}
                  </p>
                )}
            </div>
          )}
        </form.Field>

        <form.Field name="abi">
          {(field) => (
            <div className="flex items-start gap-3 pt-1">
              <FloatingTextarea
                className="flex-1 font-mono text-xs"
                label="ABI"
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder='[{"type":"function",...}]'
                value={field.state.value ?? ''}
              />
              <button
                aria-label="Clear ABI"
                className="mt-5 text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => field.handleChange('')}
                type="button"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
        </form.Field>
      </CardContent>
    </Card>
  ),
})
