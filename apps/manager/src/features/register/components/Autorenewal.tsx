'use client'

import { Trans } from '@lingui/react/macro'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRightIcon, CheckCircleIcon } from 'lucide-react'
import { useState } from 'react'
import { QRPattern } from '@/components/atoms'
import { Button } from '@/components/ui/button'
import {
  calculateExpirationDate,
  formatYears,
} from '@/features/register/components/Pricing/utils'

interface AutorenewalProps {
  domainName: string
  duration: number
  onReset?: () => void
  onCompleteFlow?: () => void
}

export const Autorenewal = ({
  domainName,
  duration,
  onReset,
  onCompleteFlow,
}: AutorenewalProps) => {
  const navigate = useNavigate()
  const [skipped, setSkipped] = useState(false)
  const expiryDate = calculateExpirationDate(duration)
  const formattedDurationYears = formatYears(duration)
  const expiryDateString = expiryDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const handleSkipAutorenewal = () => {
    setSkipped(true)
  }

  const handleNavigateAway = (to: string) => {
    // Clear localStorage when user completes the flow
    onCompleteFlow?.()
    // Reset the registration state when navigating away
    onReset?.()
    navigate({ to })
  }

  return (
    <div className="mx-auto max-w-md space-y-8 p-6 text-center">
      <div className="flex justify-center">
        <QRPattern />
      </div>

      <div className="space-y-20">
        {/* Domain name with expiry */}
        <div className="space-y-2">
          <div className="flex justify-center">
            <div className="inline-flex items-center rounded bg-gray-800 px-4 py-2 font-medium font-mono text-white">
              {domainName}
            </div>
          </div>
          <p className="text-gray-600 text-sm">
            <Trans>expires {expiryDateString}</Trans>
          </p>
        </div>

        {skipped ? (
          <div className="space-y-4">
            <Button
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-background px-4 py-4 text-foreground hover:text-white"
              onClick={() => handleNavigateAway('/')}
            >
              <Trans>Create profile</Trans>
              <ArrowRightIcon className="h-4 w-4" />
            </Button>
            <Button
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-background px-4 py-4 text-foreground hover:text-white"
              onClick={() => handleNavigateAway('/')}
            >
              <Trans>Back to dashboard</Trans>
              <ArrowRightIcon className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 text-left">
            <h3 className="font-medium text-gray-900">
              <Trans>Protect your name with autorenewal</Trans>
            </h3>
            <p className="text-gray-600 text-sm">
              <Trans>
                Your {formattedDurationYears}-year registration expires on{' '}
                {expiryDateString}. Add a credit card to renew it automatically.
                You can pause or cancel anytime.
              </Trans>
            </p>
          </div>
        )}

        {!skipped && (
          <div className="space-y-3">
            <Button className="w-full bg-gray-900 text-white hover:bg-gray-800">
              <Trans>Add credit card</Trans>
            </Button>
            <Button
              className="w-full text-gray-600"
              onClick={handleSkipAutorenewal}
              variant="ghost"
            >
              <Trans>Skip</Trans> →
            </Button>
          </div>
        )}

        {skipped && (
          <div className="space-y-2">
            <div className="flex items-start justify-start gap-2">
              <CheckCircleIcon className="h-4 w-4 text-gray-600" />
              <span className="font-medium text-gray-900 text-sm">
                <Trans>Registration successful</Trans>
              </span>
            </div>
            <div className="h-1 w-full rounded-full bg-gray-200">
              <div className="h-1 w-full rounded-full bg-gray-600"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
