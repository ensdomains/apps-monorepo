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
}
