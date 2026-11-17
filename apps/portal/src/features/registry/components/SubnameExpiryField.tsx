import { ChevronRight } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ExtensionDurationOrExpiryPicker } from '@/features/renew/components/ExtensionDurationOrExpiryPicker'
import {
  DEFAULT_SUBNAME_EXPIRY,
  type SubnameExpiry,
} from '../utils/subnameExpiry'

type SubnameExpiryFieldProps = {
  readonly expiry: SubnameExpiry
  readonly onExpiryChange: (expiry: SubnameExpiry) => void
  readonly disabled?: boolean
}

/** "Advanced settings": a new subname has no expiry unless "Set an expiry" is ticked. */
export const SubnameExpiryField = ({
  expiry,
  onExpiryChange,
  disabled = false,
}: SubnameExpiryFieldProps) => (
  <Collapsible className="group/advanced flex flex-col gap-4">
    <CollapsibleTrigger className="flex w-fit items-center gap-2 font-medium cursor-pointer">
      <ChevronRight className="size-4 transition-transform group-data-[state=open]/advanced:rotate-90" />
      Advanced settings
    </CollapsibleTrigger>
    <CollapsibleContent className="flex flex-col gap-4">
      <label
        htmlFor="subname-set-expiry"
        className="flex items-start gap-3 cursor-pointer"
      >
        <Checkbox
          id="subname-set-expiry"
          checked={expiry.type === 'span'}
          onCheckedChange={(checked) =>
            onExpiryChange(
              checked === true
                ? { type: 'span', span: { type: 'years', years: 1 } }
                : DEFAULT_SUBNAME_EXPIRY,
            )
          }
          disabled={disabled}
          className="mt-0.5"
        />
        <span className="flex flex-col gap-1">
          <span className="font-medium">Set an expiry</span>
          <span className="text-p text-muted-foreground">
            The new owner loses it on the date you pick, unless it’s extended.
            It can then be created again.
          </span>
        </span>
      </label>
      {expiry.type === 'span' && (
        <ExtensionDurationOrExpiryPicker
          span={expiry.span}
          setSpan={(span) => onExpiryChange({ type: 'span', span })}
          disabled={disabled}
        />
      )}
    </CollapsibleContent>
  </Collapsible>
)
