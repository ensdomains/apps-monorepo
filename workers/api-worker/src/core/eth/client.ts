import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { ok, type Result } from 'neverthrow'
import {
  createPublicClient,
  type HttpTransport,
  http,
  type PublicClient,
} from 'viem'
import { sepolia } from 'viem/chains'
import { error, type GenericError } from '../../utils/result'

const sepoliaWithEns = extendChainWithEns(sepolia)

// Annotated rather than inferred: viem's own action types aren't all reachable
// from the package root, so `tsc --emitDeclarationOnly` can't name the inferred
// client ("cannot be named without a reference to viem/_types/actions/token").
export type ViemClient = PublicClient<HttpTransport, typeof sepoliaWithEns>

export const createEnsClient = (
  env: CloudflareBindings,
): Result<ViemClient, GenericError> => {
  if ((env.CHAIN as string) !== 'sepolia') {
    return error({
      code: 'INVALID_CHAIN',
      message: `Invalid chain: ${env.CHAIN}`,
    })
  }

  if (!env.SEPOLIA_RPC_URL) {
    return error({
      code: 'MISSING_SEPOLIA_RPC_URL',
      message: 'SEPOLIA_RPC_URL is not configured',
    })
  }

  const client = createPublicClient({
    chain: sepoliaWithEns,
    transport: http(env.SEPOLIA_RPC_URL),
  })

  return ok(client)
}
