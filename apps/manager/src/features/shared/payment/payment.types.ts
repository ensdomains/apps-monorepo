export type PaymentFlow = 'registration' | 'renewal'

export type PaymentFundingSummary = {
  readonly registration: number
  readonly networkFee: number
  readonly total: number
  readonly hcaCredit: number
  readonly walletDebit: number
  readonly isLoading: boolean
}
