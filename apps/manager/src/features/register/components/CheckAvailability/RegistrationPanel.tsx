import { DomainResultCard } from '@/components/molecules'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import type { CheckAvailabilityResult } from './types'

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

  const header = isAvailable ? (
    <DomainResultCard
      domainName={result.name}
      status={result.isPremium ? 'premium' : 'available'}
      isPremium={result.isPremium}
      link={{
        to: '/register',
        search: { name: result.name },
      }}
    />
  ) : null

  return (
    <div className="relative z-10 flex w-full justify-center">
      <div
        className={cn(
          'registration-summary-card',
          'w-full',
          'max-w-4xl',
          'rounded-sm',
          'border',
          'border-slate-200',
          'bg-gradient-to-b',
          'from-white',
          'via-white',
          'to-slate-50',
          'p-8',
          'shadow-2xl',
        )}
      >
        {header}

        <div className="mt-8 space-y-8">
          {registrationSuccess && (
            <Alert className="border-brand-green/30 bg-brand-green-light text-brand-green-dark">
              <AlertDescription>
                Registration successful! You&apos;ll receive a confirmation
                shortly.
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
              <p className="text-brand-grey-text">
                This name is already registered or not available for
                registration.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
