import type {
  PricingDuration,
  PricingOptions,
} from '@/features/register/components/Pricing/types'
import type { PremiumLabel, ValidationError } from '@/features/register/utils'

export interface CheckAvailabilityContext {
  searchQuery: string
  selectedName: string
  isAvailable: boolean
  selectedDuration: PricingDuration | null
  pricing: PricingOptions
  error: string | null
  isPremium?: boolean
  registrationSuccess: boolean
}

export type CheckAvailabilityEvent =
  | { type: 'SEARCH'; query: string }
  | { type: 'OPEN_MODAL' }
  | { type: 'CLOSE_MODAL' }
  | { type: 'SELECT_DURATION'; duration: PricingDuration }
  | { type: 'CONFIRM' }
  | { type: 'RESET' }

export type CheckAvailabilityResult = {
  name: string
  isAvailable: boolean
  isPremium?: boolean
  pricePerYear?: number
  onRegister?: () => void
}
export type SearchState = {
  searchQuery: string
  selectedName: string
  isAvailable: boolean
  error: string | null
  validationError: ValidationError
  premiumLabel?: PremiumLabel
  registrationSuccess: boolean
}

export type PricingState = {
  pricing: PricingOptions
  isPricingLoading: boolean
}

export type State = {
  search: SearchState
  pricing: PricingState
  isSearching: boolean
}

export type Action =
  | { type: 'SEARCH_START'; payload: { query: string } }
  | { type: 'SEARCH_SUCCESS'; payload: { name: string; isAvailable: boolean } }
  | { type: 'SEARCH_ERROR'; payload: { error: string; name: string } }
  | {
      type: 'VALIDATION_ERROR'
      payload: { error: ValidationError; query: string }
    }
  | { type: 'CLEAR_VALIDATION' }
  | { type: 'RESET_SEARCH' }
  | { type: 'CLEAR_RESULTS' } // NEW - clears results immediately
  | { type: 'PRICING_START' }
  | { type: 'PRICING_SUCCESS'; payload: { pricing: PricingOptions } }
  | { type: 'PRICING_END' }
  | { type: 'SET_REGISTRATION_SUCCESS'; payload: boolean }
