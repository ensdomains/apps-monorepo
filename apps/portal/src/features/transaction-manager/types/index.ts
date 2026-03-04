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
