export type TransactionModalContentState =
  | {
      type: 'overview'
    }
  | {
      type: 'info'
      index: number
    }
  | {
      type: 'state'
      index: number
    }

export type Transaction = {
  title: string
  transactionName: string
  estimatedGasCost: number
  onStart: () => void
}
