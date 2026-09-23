import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { truncateName } from '@/utils/formatting/truncateName'
import type { SelectedName } from '../hooks/useRenewalTransactions'
import type { ExtensionSpan } from '../utils/extensionDurationPicker'
import { ExtendNameCheckoutSummary } from './ExtendNameCheckoutSummary'
import { ExtensionDurationOrExpiryPicker } from './ExtensionDurationOrExpiryPicker'

type ExtendNameSettingsProps = {
  readonly selectedName: SelectedName
  readonly span: ExtensionSpan
  readonly setSpan: (span: ExtensionSpan) => void
  readonly baseDate?: Temporal.PlainDate
  /** When omitted, the back button is hidden — used when there's no preceding disclaimer step */
  readonly onBack?: () => void
  readonly onNext: () => void
}

export const ExtendNameSettings = ({
  selectedName,
  span,
  setSpan,
  baseDate,
  onBack,
  onNext,
}: ExtendNameSettingsProps) => {
  return (
    <div className="space-y-6 mt-2 min-w-0">
      <div className="flex items-center gap-2">
        <NameAvatar name={selectedName.name} height="60px" width="60px" />
        <h2
          className="text-h2 min-w-0 truncate text-foreground"
          title={selectedName.name}
        >
          {truncateName(selectedName.name)}
        </h2>
      </div>
      <ExtensionDurationOrExpiryPicker
        span={span}
        setSpan={setSpan}
        expiryDate={selectedName.expiryDate}
        name={selectedName.name}
      />
      <ExtendNameCheckoutSummary
        selectedName={selectedName}
        span={span}
        baseDate={baseDate}
      />
      <div className="flex gap-2">
        {onBack ? (
          <Button variant="outline" size="icon" onClick={onBack}>
            <ArrowLeft className="size-4" />
          </Button>
        ) : null}
        <Button className="flex-1" variant="default" onClick={onNext}>
          Next
        </Button>
      </div>
    </div>
  )
}
