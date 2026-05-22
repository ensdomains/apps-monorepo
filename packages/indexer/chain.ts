import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { sepolia } from 'viem/chains'

/**
 * Single source of truth for chain / RPC / wallet config used across the apps.
 */

const DEFAULT_SEPOLIA_RPC_URL =
  'https://virtual.sepolia.us-east.rpc.tenderly.co/8ac7f709-c00b-49e9-a353-4e0bfcfeef1a'

function resolveRpcUrl(): string {
  try {
    if (typeof import.meta !== 'undefined') {
      const envUrl = import.meta.env?.VITE_SEPOLIA_RPC_URL
      if (!envUrl) return DEFAULT_SEPOLIA_RPC_URL
      // Relative paths (like /rpc) only work in the browser.
      // During SSR use the server-specific URL or fall back to the default.
      if (envUrl.startsWith('/') && typeof window === 'undefined') {
        return (
          import.meta.env?.VITE_SEPOLIA_RPC_URL_SERVER ||
          DEFAULT_SEPOLIA_RPC_URL
        )
      }
      return envUrl
    }
  } catch {
    // SSR or non-Vite environment
  }
  return DEFAULT_SEPOLIA_RPC_URL
}

export const SEPOLIA_RPC_URL: string = resolveRpcUrl()

export const WALLETCONNECT_PROJECT_ID = '1cb2e088d817de31a39a54154b265f68'

export const customSepolia = {
  ...sepolia,
  rpcUrls: {
    default: { http: [SEPOLIA_RPC_URL] },
    public: { http: [SEPOLIA_RPC_URL] },
  },
}

export const sepoliaWithEns = extendChainWithEns(customSepolia)
