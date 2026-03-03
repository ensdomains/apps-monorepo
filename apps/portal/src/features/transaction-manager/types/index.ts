export type PortalTransaction = {
  title: string
  estimatedGasCost: number
  onStart: () => void
  onRetry: () => void
  onDone: () => void
  onError: (error: Error) => void
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  error: Error | null
  txHash: string | null
  reset: () => void
}
