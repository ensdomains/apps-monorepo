/**
 * Result type for domain availability check - used by RegistrationPanel
 */
export type CheckAvailabilityResult = {
  name: string
  isAvailable: boolean
  isPremium?: boolean
  pricePerYear?: number
  onRegister?: () => void
}
