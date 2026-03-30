'use client'

import { Trans } from '@lingui/react/macro'
import type { ComponentType } from 'react'
import { DomainAttributePill } from '@/components/molecules/DomainResultCard/DomainAttributePill'
import { Button } from '@/components/ui/button'
import type { PremiumLabel } from '@/features/register/utils'
import { cn } from '@/lib/utils'
import { formatAmount } from '@/utils/payment'

interface CryptoPaymentConfirmationContentProps {
  domainName: string
  priceUSD: number
  selectedCoinIcon: ComponentType<{ className?: string }>
  selectedCoinSymbol: string
  premiumLabel?: PremiumLabel
  onConfirm: () => void
}

const CONFIRMATION_DOMAIN_CHAR_TIERS = [30, 80] as const

function getConfirmationDomainSizeClasses(domainName: string): string {
  const charCount = Array.from(domainName).length

  if (charCount <= CONFIRMATION_DOMAIN_CHAR_TIERS[0]) {
    return 'text-[40px]'
  }

  if (charCount <= CONFIRMATION_DOMAIN_CHAR_TIERS[1]) {
    return 'text-[32px]'
  }

  return 'text-[24px]'
}

export const CryptoPaymentConfirmationContent = ({
  domainName,
  priceUSD,
  selectedCoinIcon: SelectedCoinIcon,
  selectedCoinSymbol,
  premiumLabel,
  onConfirm,
}: CryptoPaymentConfirmationContentProps) => {
  const domainSizeClasses = getConfirmationDomainSizeClasses(domainName)

  return (
    <div className="flex min-h-[500px] flex-col justify-between gap-4 px-4">
      <div className="flex flex-col items-center gap-6">
        {/* Header */}
        <h2 className="text-center font-medium text-2xl text-ens-blue tracking-wide">
          <Trans>Registering</Trans>
        </h2>

        <div className="flex w-[420px] min-w-0 max-w-full flex-col items-center gap-4 rounded-xl bg-[rgb(250,250,250)] px-6 py-8">
          {premiumLabel && (
            <DomainAttributePill
              label={premiumLabel.label}
              variant={premiumLabel.variant}
            />
          )}
          <span
            className={cn(
              'w-full min-w-0 break-words text-center font-medium font-semi-mono',
              'whitespace-normal leading-[96%] tracking-[-0.8px] [overflow-wrap:anywhere]',
              'text-[var(--Primary-Grey,#4A5C63)]',
              domainSizeClasses,
            )}
            title={domainName}
          >
            {domainName}
          </span>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-base text-ens-gray">
            <Trans>for</Trans>
          </span>
          <div className="flex items-baseline gap-1">
            <SelectedCoinIcon className="h-6 w-6 self-center" />
            <span className="font-medium text-2xl text-ens-gray tracking-tight">
              ${formatAmount(priceUSD, 0)}
            </span>
            <span className="text-ens-gray-three text-lg">
              {selectedCoinSymbol}
            </span>
          </div>
        </div>
      </div>

      <Button
        className="h-20 w-full rounded bg-ens-blue font-medium font-mono text-sm text-white uppercase tracking-wider hover:bg-ens-blue-hover"
        onClick={onConfirm}
      >
        <Trans>Buy Name</Trans>
      </Button>
    </div>
  )
}
