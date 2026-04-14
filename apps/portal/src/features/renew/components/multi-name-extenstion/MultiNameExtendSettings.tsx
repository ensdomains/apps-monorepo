import { Button } from '@/components/ui/button'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { RegistrationDurationOrExpiryPicker } from '@/features/register/components/RegistrationDurationOrExpiryPicker'
import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import type { SelectedName } from '../../hooks/useRenewalTransactions'

type MultiNameExtendSettingsProps = {
  readonly selectedNames: readonly SelectedName[]
  readonly duration: number
  readonly setDuration: (duration: number) => void
  readonly onNext: () => void
}

type MultiNameSummaryCardProps = {
  readonly selected: SelectedName
  readonly duration: number
}

const MultiNameSummaryCard = ({
  selected,
  duration,
}: MultiNameSummaryCardProps) => {
  return (
    <li key={selected.name} className="flex items-center gap-3">
      <NameAvatar name={selected.name} height="40px" width="40px" />
      <span className="text-base font-medium text-quartz-900">
        {selected.name}
      </span>
    </li>
  )
}

export const MultiNameExtendSettings = ({
  selectedNames,
  duration,
  setDuration,
  onNext,
}: MultiNameExtendSettingsProps) => {
  return (
    <div className="space-y-6 mt-2">
      <RegistrationDurationOrExpiryPicker
        labelPrefix="Extend"
        duration={duration}
        setDuration={setDuration}
      />

      <ul className="space-y-2">
        {selectedNames.map((selected) => (
          <MultiNameSummaryCard
            key={selected.name}
            selected={selected}
            duration={duration}
          />
        ))}
      </ul>

      <Button className="w-full" variant="secondary" onClick={onNext}>
        Next
      </Button>
    </div>
  )
}
