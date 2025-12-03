import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { ok, type Result } from 'neverthrow'
import { createPublicClient, http } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { error } from '../../utils/result'

const chains = {
  mainnet: extendChainWithEns(mainnet),
  sepolia: extendChainWithEns(sepolia),
}

export type ViemClient =
  ReturnType<typeof createEnsClient> extends Result<infer T, infer E>
    ? T
    : never

export const createEnsClient = (env: CloudflareBindings) => {
  const chain = chains[env.CHAIN as keyof typeof chains]

  if (!chain) {
    return error({
      code: 'INVALID_CHAIN',
      message: `Invalid chain: ${env.CHAIN}`,
    })
  }

  const client = createPublicClient({
    chain: chain,
    transport: http(),
  })

  return ok(client)
}
