import { type EnsChain, NetworkConfigError } from '@ens-apps/config'
import { fromSync } from '@ens-apps/utils/neverthrow'
import { ok, type Result } from 'neverthrow'
import {
  createPublicClient,
  type HttpTransport,
  http,
  type PublicClient,
} from 'viem'
import { error, type GenericError } from '../../utils/result'
import { getConfig } from '../config'

export type ViemClient =
  ReturnType<typeof createEnsClient> extends Result<infer T, infer _E>
    ? T
    : never

export const createEnsClient = (
  env: CloudflareBindings,
): Result<PublicClient<HttpTransport, EnsChain>, GenericError> => {
  if (env.CHAIN !== 'sepolia' && env.CHAIN !== 'mainnet') {
    return error({
      code: 'UNSUPPORTED_CHAIN',
      message: 'ENS client supports only mainnet and Sepolia',
    })
  }

  // Require the selected network's binding; never fall back to another
  // network's RPC or the shared config's public fallback endpoints.
  const binding =
    env.CHAIN === 'mainnet' ? 'MAINNET_RPC_URL' : 'SEPOLIA_RPC_URL'
  const rpcUrl = env[binding]?.trim()
  if (!rpcUrl) {
    return error({
      code: `MISSING_${binding}` as const,
      message: `${binding} is not configured`,
    })
  }

  const validRpcUrl = fromSync(
    () => ['http:', 'https:'].includes(new URL(rpcUrl).protocol),
    () => false,
  )
  if (!validRpcUrl.unwrapOr(false)) {
    return error({
      code: 'INVALID_RPC_URL',
      message: `${binding} must be an absolute http(s) URL`,
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
      transport: http(rpcUrl),
    }),
  )
}
