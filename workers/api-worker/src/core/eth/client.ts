import { NetworkConfigError } from '@ens-apps/config'
import { ok, type Result } from 'neverthrow'
import { createPublicClient, http } from 'viem'
import { error } from '../../utils/result'
import { getConfig } from '../config'

export type ViemClient =
  ReturnType<typeof createEnsClient> extends Result<infer T, infer _E>
    ? T
    : never

export const createEnsClient = (env: CloudflareBindings) => {
  if (!env.SEPOLIA_RPC_URL) {
    return error({
      code: 'MISSING_SEPOLIA_RPC_URL',
      message: 'SEPOLIA_RPC_URL is not configured',
    })
  }

  // The chain comes from the shared network config, so an unknown or
  // undeployed CHAIN fails here for the same reason it fails an app build.
  let chain: ReturnType<typeof getConfig>['chain']
  try {
    chain = getConfig(env).chain
  } catch (cause) {
    return error({
      code: 'INVALID_CHAIN',
      message:
        cause instanceof NetworkConfigError
          ? cause.message
          : `Invalid chain: ${env.CHAIN}`,
    })
  }

  const client = createPublicClient({
    chain,
    transport: http(env.SEPOLIA_RPC_URL),
  })

  return ok(client)
}
