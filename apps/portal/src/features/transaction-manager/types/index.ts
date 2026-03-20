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
  /** Sub-steps bundled with this transaction, shown as a list after the wallet signature */
  readonly steps?: readonly string[]
}
