import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { ok, type Result } from 'neverthrow'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { error } from '../../utils/result'

// Single source of truth for Sepolia RPC URL
export const SEPOLIA_RPC_URL =
  'https://lb.drpc.live/sepolia/AnmpasF2C0JBqeAEzxVO8aQfci4RAcMR8bLtehXRfUMv'

// Create a custom Sepolia chain with working RPC
export const customSepolia = {
  ...sepolia,
  rpcUrls: {
    default: { http: [SEPOLIA_RPC_URL] },
    public: { http: [SEPOLIA_RPC_URL] },
  },
}

export const sepoliaWithEns = extendChainWithEns(customSepolia)

export type ViemClient =
  ReturnType<typeof createEnsClient> extends Result<infer T, infer _E>
    ? T
    : never

export const createEnsClient = (env: CloudflareBindings) => {
  if ((env.CHAIN as string) !== 'sepolia') {
    return error({
      code: 'INVALID_CHAIN',
      message: `Invalid chain: ${env.CHAIN}`,
    })
  }

  const client = createPublicClient({
    chain: sepoliaWithEns,
    transport: http(SEPOLIA_RPC_URL),
  })

  return ok(client)
}
