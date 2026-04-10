import {
  extendChainWithEns,
  getChainContractAddress,
} from '@ensdomains/ensjs/chain'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'

const sepoliaWithEns = extendChainWithEns(sepolia)

export const v2EthRegistry = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})

export function createClient(env: Env) {
  return createPublicClient({
    chain: sepoliaWithEns,
    transport: http(env.SEPOLIA_RPC_URL),
  })
}

export type EnsClient = ReturnType<typeof createClient>
