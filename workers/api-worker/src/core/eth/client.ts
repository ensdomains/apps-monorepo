import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { ok, type Result } from 'neverthrow'
import {
  createPublicClient,
  http,
  type PublicClient,
  type Transport,
} from 'viem'
import { sepolia } from 'viem/chains'
import { error } from '../../utils/result'

// Single source of truth for Sepolia RPC URL
export const SEPOLIA_RPC_URL =
  'https://lb.drpc.live/sepolia/AnmpasF2C0JBqeAEzxVO8aRo7Ju0xlER8JS4QmlfqV1j'

// Create a custom Sepolia chain with working RPC
export const customSepolia = {
  ...sepolia,
  rpcUrls: {
    default: { http: [SEPOLIA_RPC_URL] },
    public: { http: [SEPOLIA_RPC_URL] },
  },
}

export const sepoliaWithEns = extendChainWithEns(customSepolia)

/**
 * Explicit named client type: without it, declaration emit (build:types)
 * inlines the inferred client shape, which since viem 2.55 references
 * unexported internals (actions/token/*) → TS2883.
 */
export type ViemClient = PublicClient<Transport, typeof sepoliaWithEns>

export const createEnsClient = (
  env: CloudflareBindings,
): Result<ViemClient, { code: 'INVALID_CHAIN'; message: string }> => {
  if ((env.CHAIN as string) !== 'sepolia') {
    return error({
      code: 'INVALID_CHAIN',
      message: `Invalid chain: ${env.CHAIN}`,
    })
  }

  const client: ViemClient = createPublicClient({
    chain: sepoliaWithEns,
    transport: http(SEPOLIA_RPC_URL),
  })

  return ok(client)
}
