/**
 * Read-only viem client for the Mainnet fork used by the "metadata" project's
 * MD1 scenario (WEB-1191) — see `infra/docker-compose.yml`'s `anvil-mainnet`
 * service.
 *
 * Unlike `anvil-client.ts` (Sepolia), nothing registers or writes through
 * this client: mainnet v1 coverage only needs to *read* an already-registered
 * name's real on-chain state as the independent oracle for what the metadata
 * service reports, so a public client is all this needs.
 */
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'

const ANVIL_MAINNET_RPC_URL =
  process.env.ANVIL_MAINNET_RPC_URL ?? 'http://127.0.0.1:8546'

const localMainnet = {
  ...mainnet,
  rpcUrls: {
    default: { http: [ANVIL_MAINNET_RPC_URL] },
  },
} as const

export const mainnetPublicClient = createPublicClient({
  chain: localMainnet,
  transport: http(ANVIL_MAINNET_RPC_URL),
})
