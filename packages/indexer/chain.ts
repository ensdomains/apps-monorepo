import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { sepolia } from 'viem/chains'

/**
 * Single source of truth for chain / RPC / wallet config used across the apps.
 */

const DEFAULT_SEPOLIA_RPC_URL =
  'https://virtual.sepolia.us-east.rpc.tenderly.co/5861d235-a772-47a3-8772-4f6a3f2ea4b5'

// V2 ENS contracts as deployed on the Tenderly virtual sepolia fork (block
// 10770759). ensjs ships sepolia mainnet addresses by default, but those
// resolve to pre-fork state on this fork — using them would silently read
// real sepolia data (e.g. show pre-fork registrations as owned). Override
// here so getChainContractAddress returns the fork-specific deployments.
const TENDERLY_FORK_BLOCK = 10770759
const TENDERLY_FORK_V2_CONTRACTS = {
  ensRegistry: '0x31a2bb5d933557cce1b3129993193896d074db92',
  ensUniversalResolver: '0xeeeeeeee14d718c2b47d9923deab1335e144eeee',
  ensEthRegistrar: '0x26e5e80e8f36607ef401443fb34eea363c86e8f7',
  ensVerifiableFactory: '0x26997c9d0f3dcbae3f78c69e621a3926ee30bb98',
  ensPermissionedResolverImpl: '0x73bad0460ef02b8d6a9de17550218e9e20663c19',
  ensUserRegistryImpl: '0xb3e3335208fe9cd98366b7a8299ca21dee4840f1',
} as const

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

const baseSepoliaWithEns = extendChainWithEns(customSepolia)

export const sepoliaWithEns = {
  ...baseSepoliaWithEns,
  contracts: {
    ...baseSepoliaWithEns.contracts,
    ...Object.fromEntries(
      Object.entries(TENDERLY_FORK_V2_CONTRACTS).map(([name, address]) => [
        name,
        { address, blockCreated: TENDERLY_FORK_BLOCK },
      ]),
    ),
  },
} as typeof baseSepoliaWithEns
