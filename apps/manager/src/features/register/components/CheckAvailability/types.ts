export type PricingDuration = 1 | 2 | 3 | 4 | 5

export interface PricingOption {
  price: number
  discount: number
  label: string
  badge?: 'best'
  total?: number
}

export type PricingOptions = Record<PricingDuration, PricingOption>

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
