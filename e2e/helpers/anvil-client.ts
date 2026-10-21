/**
 * Shared viem clients for the local Anvil Sepolia fork.
 *
 * Provides publicClient (read), testClient (anvil manipulation),
 * and walletClient (write) all pointing at the same RPC endpoint.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
} from 'viem'
import { sepolia } from 'viem/chains'

const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'

const transport = http(ANVIL_RPC_URL)

/**
 * Override Sepolia to use the local Anvil RPC.
 * Chain ID stays 11155111 so contract addresses match the fork.
 *
 * `contracts` merges viem's own built-ins (e.g. `multicall3`) with ensjs's
 * full V1+V2 contract set. Without the ensjs half, viem's native `sepolia`
 * only knows `ensRegistry`/`ensUniversalResolver` — any V2 action that reads
 * a contract viem itself doesn't know about (e.g. `getOwner`'s V2 path needs
 * `ensUniversalHelper`) throws `ChainDoesNotSupportContract` even though the
 * contract is deployed and reachable on this fork.
 */
const localSepolia = {
  ...sepolia,
  contracts: {
    ...sepolia.contracts,
    ...ensL1Contracts[supportedL1Chains.sepolia],
  },
  rpcUrls: {
    default: { http: [ANVIL_RPC_URL] },
  },
} as const

export const publicClient = createPublicClient({
  chain: localSepolia,
  transport,
})

export const testClient = createTestClient({
  chain: localSepolia,
  transport,
  mode: 'anvil',
})

export const walletClient = createWalletClient({
  chain: localSepolia,
  transport,
})
