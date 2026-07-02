import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import type { SelectedName } from '../hooks/useRenewalTransactions'
import { ExtendNameCheckoutSummary } from './ExtendNameCheckoutSummary'
import type { ExtensionSpanType } from './ExtensionDurationOrExpiryPicker'
import { ExtensionDurationOrExpiryPicker } from './ExtensionDurationOrExpiryPicker'

type ExtendNameSettingsProps = {
  readonly selectedName: SelectedName
  readonly duration: number
  readonly setDuration: (duration: number) => void
  readonly spanType: ExtensionSpanType
  readonly setSpanType: (type: ExtensionSpanType) => void
  readonly baseDate?: Temporal.PlainDate
  /** When omitted, the back button is hidden — used when there's no preceding disclaimer step */
  readonly onBack?: () => void
  readonly onNext: () => void
}

export const ExtendNameSettings = ({
  selectedName,
  duration,
  setDuration,
  spanType,
  setSpanType,
  baseDate,
  onBack,
  onNext,
}: ExtendNameSettingsProps) => {
  return (
    <div className="space-y-6 mt-2">
      <div className="flex items-center gap-2">
        <NameAvatar name={selectedName.name} height="60px" width="60px" />
        <h2 className="text-3xl font-medium w-max text-foreground">
          {selectedName.name}
        </h2>
      </div>
      <ExtensionDurationOrExpiryPicker
        duration={duration}
        setDuration={setDuration}
        expiryDate={selectedName.expiryDate}
        spanType={spanType}
        setSpanType={setSpanType}
        // Per-year discount preset chips are v2-only; omit `name` for v1 so the
        // picker renders the length/date selector without pricing chips.
        name={selectedName.isV2 ? selectedName.name : undefined}
      />
      <ExtendNameCheckoutSummary
        selectedName={selectedName}
        duration={duration}
        spanType={spanType}
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
