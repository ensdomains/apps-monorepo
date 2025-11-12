import { DomainResultCard } from '@/components/molecules'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RegistrationSummaryCard } from '../../RegistrationSummaryCard'
import type { CheckAvailabilityResult } from '../types'

export type RegistrationPanelProps = {
  isOpen: boolean
  result: CheckAvailabilityResult
  onClose: () => void
  isProcessing: boolean
  error?: string | null
  registrationSuccess: boolean
  isPricingLoading?: boolean
}

export const RegistrationPanel = ({
  isOpen,
  result,
  onClose: _onClose,
  isProcessing: _isProcessing,
  error,
  registrationSuccess,
  isPricingLoading: _isPricingLoading = false,
}: RegistrationPanelProps) => {
  if (!isOpen) return null

  const isAvailable = result.isAvailable

  const header = (
    <DomainResultCard
      domainName={result.name}
      status={
        isAvailable
          ? result.isPremium
            ? 'premium'
            : 'available'
          : 'unavailable'
      }
      isPremium={result.isPremium}
      link={
        isAvailable
          ? {
              to: '/register',
              search: { name: result.name },
            }
          : undefined
      }
    />
  )

  return (
    <RegistrationSummaryCard header={header}>
      {registrationSuccess && (
        <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700">
          <AlertDescription>
            Registration successful! You&apos;ll receive a confirmation shortly.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!isAvailable && (
        <div className="py-4 text-center">
          <p className="text-slate-600">
            This name is already registered or not available for registration.
          </p>
        </div>
      )}
    </RegistrationSummaryCard>
  )
}
