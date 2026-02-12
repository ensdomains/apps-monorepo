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
        <form.Field name="contentHash">
          {(field) => (
            <div className="flex items-center gap-3 pt-1">
              <FloatingInput
                className="flex-1"
                label="Content Hash"
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="ipfs://... or 0x..."
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
