export type TransactionModalContentState =
  | {
      readonly type: 'overview'
    }
  | {
      readonly type: 'info'
      readonly transactionId: string
    }
  | {
      readonly type: 'state'
      readonly transactionId: string
    }

export type Transaction = {
  readonly id: string
  readonly title: string
  readonly transactionName: string
  readonly estimatedGasCost: number
  readonly onDone: () => void
  readonly onStart: () => void
  readonly steps?: readonly string[]
  /**
   * Unix timestamp (ms) at which this transaction can start. When set and in
   * the future, the modal renders a countdown on the step instead of letting
   * the user trigger it. Used for the registration commit-reveal cooldown.
   */
  readonly waitUntil?: number
}
