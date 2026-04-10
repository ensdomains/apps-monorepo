import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { PaymentTokenPicker } from '@/features/register/components/PaymentTokenPicker'
import { RegistrationSummaryCards } from '@/features/register/components/RegistrationSummaryCards'
import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import type { TokenWithPriceAndBalance } from '@/features/register/utils/tokenData'
import type { SelectedName } from '../hooks/useRenewalTransactions'

type ExtendNameConfirmationProps = {
  readonly selectedName: SelectedName
  readonly durationSeconds: number
  readonly price: RegistrationPriceResult
  readonly onConfirm: (token: TokenWithPriceAndBalance) => void
  readonly isRegistering: boolean
}

export const ExtendNameConfirmation = ({
  selectedName,
  durationSeconds,
  price,
  onConfirm,
  isRegistering,
}: ExtendNameConfirmationProps) => {
  const [selectedTokenData, setSelectedTokenData] =
    useState<TokenWithPriceAndBalance | null>(null)

  return (
    <div className="space-y-6 mt-2">
      <div className="flex items-center gap-2">
        <NameAvatar name={selectedName.name} height="60px" width="60px" />
        <h2 className="text-3xl font-medium w-max text-quartz-900">
          {selectedName.name}
        </h2>
      </div>
      <RegistrationSummaryCards
        domainName={selectedName.name}
        durationSeconds={durationSeconds}
        price={price}
      />
      <PaymentTokenPicker
        name={selectedName.name}
        duration={durationSeconds}
        isRegistering={isRegistering}
        onSelectionChange={setSelectedTokenData}
      />
      <Button
        className="w-full"
        variant="secondary"
        disabled={!selectedTokenData}
        onClick={() => selectedTokenData && onConfirm(selectedTokenData)}
      >
        Confirm
      </Button>
    </div>
  )
}
