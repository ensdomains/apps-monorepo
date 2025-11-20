import type { DomainAttributePillVariant } from '@/components/molecules/DomainResultCard/DomainAttributePill'

// Re-export from CheckAvailability for convenience
export type {
  PricingDuration,
  PricingOptions,
} from '../CheckAvailability/types'

/**
 * Pricing quote for different tokens
 */
export type PricingQuote = {
  usdc?: number
  dai?: number
}

/**
 * Map of pricing quotes for each duration
 */
export type PricingQuoteMap = Record<number, PricingQuote>

/**
 * Premium label information
 */
export type PremiumLabel = {
  label: string
  variant: DomainAttributePillVariant
}

/**
 * Props for the main Pricing component
 */
export type PricingProps = {
  domainName: string
  duration: number
  isConnected: boolean
  isLoading?: boolean
  onSetDuration: (duration: number) => void
  onSelectPayment: (method: 'crypto' | 'credit-card') => void
  onSelectCrypto: (cryptoId: string) => void
  onConfirmPayment: (
    tokenPrice: bigint,
    selectedToken: string,
    options?: { fast?: boolean },
  ) => void
}
