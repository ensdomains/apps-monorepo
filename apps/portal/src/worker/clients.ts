import {
  extendChainWithL1Ens,
  extendChainWithL2Ens,
  getChainContractAddress,
} from '@ensdomains/ensjs/chain'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'

const sepoliaWithEns = extendChainWithL1Ens(sepolia)
const namechainSepolia = extendChainWithL2Ens(sepolia)

export const v2EthRegistry = getChainContractAddress({
  chain: namechainSepolia,
  contract: 'ensV2EthRegistry',
})

export function createL1Client(env: Env) {
  return createPublicClient({
    chain: sepoliaWithEns,
    transport: http(env.SEPOLIA_RPC_URL),
  })
}

export function createL2Client(env: Env) {
  return createPublicClient({
    chain: namechainSepolia,
    transport: http(env.SEPOLIA_RPC_URL),
  })
}

export type L1Client = ReturnType<typeof createL1Client>
export type L2Client = ReturnType<typeof createL2Client>
