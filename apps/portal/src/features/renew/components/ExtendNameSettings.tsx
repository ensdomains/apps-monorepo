import { Button } from '@/components/ui/button'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { RegistrationDurationOrExpiryPicker } from '@/features/register/components/RegistrationDurationOrExpiryPicker'
import type { SelectedName } from '../hooks/useRenewalTransactions'
import { ExtendNameCheckoutSummary } from './ExtendNameCheckoutSummary'

type ExtendNameSettingsProps = {
  readonly selectedName: SelectedName
  readonly duration: number
  readonly setDuration: (duration: number) => void
  readonly onNext: () => void
}

export const ExtendNameSettings = ({
  selectedName,
  duration,
  setDuration,
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
      <RegistrationDurationOrExpiryPicker
        labelPrefix="Extend"
        duration={duration}
        setDuration={setDuration}
        baseDate={selectedName.expiryDate ?? undefined}
      />
      <ExtendNameCheckoutSummary
        selectedName={selectedName}
        duration={duration}
      />
      <Button className="w-full" variant="secondary" onClick={onNext}>
        Next
      </Button>
    </div>
  )
}
