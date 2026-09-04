import { useMutation } from '@tanstack/react-query'
import type { Address } from 'viem'

// Hackathon deployment: point at this branch's api-worker preview, not the
// production worker behind app-api.ens.dev (which tracks main). Covered by the
// portal CSP's `https://*.ens-cf.workers.dev` connect-src entry (worker/csp.ts).
const WALLET_FUND_API_URL =
  'https://hackathon-deployment-app-api-worker.ens-cf.workers.dev'

export function useFundWallet(options?: {
  onSuccess?: (data: { txHash: string | null }) => void
  onError?: (error: Error) => void
}) {
  return useMutation({
    mutationFn: async (address: Address) => {
      const response = await fetch(`${WALLET_FUND_API_URL}/wallet/fund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })

      if (!response.ok) {
        throw new Error(
          `Failed to fund wallet: ${response.statusText} ${await response.text()}`,
        )
      }

      return response.json() as Promise<{ txHash: string | null }>
    },
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  })
}
