import { NetworkConfigError } from '@ens-apps/config'
import { fromSync } from '@ens-apps/utils/neverthrow'
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
  const chain = fromSync(
    () => getConfig(env).chain,
    (cause: unknown) => ({
      code: 'INVALID_CHAIN' as const,
      message:
        cause instanceof NetworkConfigError
          ? cause.message
          : `Invalid chain: ${env.CHAIN}`,
    }),
  )
  if (chain.isErr()) return error(chain.error)

  return ok(
    createPublicClient({
      chain: chain.value,
      transport: http(env.SEPOLIA_RPC_URL),
    }),
  )
}
