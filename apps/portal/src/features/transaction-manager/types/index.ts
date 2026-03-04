export type TransactionModalContentState =
  | {
      type: 'overview'
    }
  | {
      type: 'info'
      transactionId: string
    }
  | {
      type: 'state'
      transactionId: string
    }

export type Transaction = {
  id: string
  title: string
  transactionName: string
  estimatedGasCost: number
  onStart: () => void
  onDone: () => void
}
