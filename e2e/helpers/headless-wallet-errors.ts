import type { Web3ProviderBackend } from '@ensdomains/headless-web3-provider'

/** Keep EIP-1193 fields across Playwright's exposed-function error boundary. */
export function preserveWalletRpcErrors(wallet: Web3ProviderBackend) {
  const original = wallet.request.bind(wallet)
  wallet.request = (async (request) => {
    try {
      return await original(request)
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        typeof error.code === 'number'
      ) {
        // Playwright serializes Error instances without custom fields. A plain
        // rejection object retains the actual provider code, message and data.
        throw {
          code: error.code,
          message: 'message' in error ? String(error.message) : String(error),
          ...('data' in error ? { data: error.data } : {}),
        }
      }
      throw error
    }
  }) as typeof wallet.request
}
