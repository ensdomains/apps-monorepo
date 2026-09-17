import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import * as v from 'valibot'
import { zeroAddress } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import {
  ENS_NETWORKS,
  type EnsNetwork,
  isEnsNetwork,
  NETWORKS,
  type NetworkEndpoints,
} from './networks'

/**
 * Thrown whenever configuration cannot be resolved. Always fail here rather
 * than falling back to a network: a wrong-network fallback produces valid
 * calldata against the wrong contracts, which is far worse than not starting.
 */
export class NetworkConfigError extends Error {
  override readonly name = 'NetworkConfigError'
}

/**
 * ENSv2 contracts an app cannot function without. ensjs carries a key for
 * every network but fills undeployed ones with `zeroAddress`, so a lookup
 * returns `0x0` instead of throwing. Checking them here converts that silent
 * failure into a build-time error.
 */
const REQUIRED_ENSV2_CONTRACTS = [
  'ensRegistry',
  'ensEthRegistrar',
  'ensStandardRentPriceOracle',
  'ensPermissionedResolverImpl',
  'ensVerifiableFactory',
] as const

/**
 * `extendChainWithEns` narrows on a literal chain, so each branch passes a
 * concrete chain rather than an indexed lookup. viem types a stock chain's
 * `rpcUrls.http` as a literal tuple, so the override is applied by spreading
 * rather than by annotation.
 */
const buildEnsChain = (network: EnsNetwork, rpcUrls: readonly string[]) => ({
  ...(network === 'mainnet'
    ? extendChainWithEns(mainnet)
    : extendChainWithEns(sepolia)),
  rpcUrls: {
    default: { http: rpcUrls },
    public: { http: rpcUrls },
  },
})

/**
 * Both networks produce structurally identical chains: the same contract
 * keys, differing only in address values. Pinning the static type to one
 * instantiation keeps a single concrete chain type flowing into ensjs and
 * wagmi. Leaving it as the union would surface in every action signature
 * downstream, for a distinction that only exists in literal address types.
 */
export type EnsChain = Extract<
  ReturnType<typeof buildEnsChain>,
  { id: 11155111 }
>

/**
 * Absolute http(s) URL, or a root-relative path. Relative paths are how the
 * e2e stack and PR previews proxy an ephemeral node through the app's own
 * origin (e.g. `/rpc`), so rejecting them would break those environments.
 */
const endpointUrlSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, 'must not be empty'),
  v.check((value) => {
    if (value.startsWith('/')) return true
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol)
    } catch {
      return false
    }
  }, 'must be an absolute http(s) URL or a root-relative path'),
)

/**
 * Primary first, then the shared fallbacks with the primary removed so a
 * primary that is itself a public endpoint is not tried twice. Exported
 * because consumers that resolve their own primary at runtime (the portal's
 * SSR worker reads a Cloudflare secret) need the same ordering.
 */
export const orderedRpcUrls = (
  primary: string | undefined,
  fallbacks: readonly string[],
): readonly string[] => [
  ...(primary ? [primary] : []),
  ...fallbacks.filter((url) => url !== primary),
]

export type BuildConfigInput = {
  /**
   * Network name, typically from an env var. There is no default: an absent
   * or unrecognised value throws.
   */
  network: string | undefined
  /**
   * Preferred RPC URL. Each app owns this so provider quota stays attributed
   * per app, and the network's shared public fallbacks are appended behind
   * it. Optional: an app with no attributed endpoint for the selected network
   * uses the public fallbacks alone.
   */
  rpcUrl?: string | undefined
  /**
   * Per-endpoint overrides, typically from env. An `undefined` entry falls
   * back to the network profile; overrides are how e2e and PR previews point
   * at ephemeral infrastructure.
   */
  overrides?: Partial<Record<keyof NetworkEndpoints, string | undefined>>
}

export type EnsAppConfig = Readonly<{
  network: EnsNetwork
  isTestnet: boolean
  /** ENS-extended viem chain. Contract addresses resolve off this. */
  chain: EnsChain
  /** Primary first, then the network's shared fallbacks, deduped. */
  rpcUrls: readonly string[]
  /** The network's shared public fallbacks, for consumers resolving their own primary. */
  rpcFallbacks: readonly string[]
  endpoints: Readonly<Record<keyof NetworkEndpoints, string>>
}>

const parseOrThrow = (
  schema: typeof endpointUrlSchema,
  value: string,
  field: string,
): string => {
  const result = v.safeParse(schema, value)
  if (!result.success) {
    throw new NetworkConfigError(
      `Invalid ${field}: ${result.issues[0]?.message ?? 'invalid value'} (received ${JSON.stringify(value)})`,
    )
  }
  return result.output
}

const resolveNetwork = (network: string | undefined): EnsNetwork => {
  if (!network) {
    throw new NetworkConfigError(
      `Missing network. Set VITE_ENS_NETWORK to one of: ${ENS_NETWORKS.join(', ')}.`,
    )
  }
  if (!isEnsNetwork(network)) {
    throw new NetworkConfigError(
      `Unknown network ${JSON.stringify(network)}. Expected one of: ${ENS_NETWORKS.join(', ')}.`,
    )
  }
  return network
}

const resolveEndpoints = (
  network: EnsNetwork,
  overrides: BuildConfigInput['overrides'],
): Record<keyof NetworkEndpoints, string> => {
  const profile = NETWORKS[network].endpoints
  const resolved: Partial<Record<keyof NetworkEndpoints, string>> = {}
  const missing: string[] = []

  for (const key of Object.keys(profile) as (keyof NetworkEndpoints)[]) {
    const value = overrides?.[key] ?? profile[key]
    if (!value) {
      missing.push(key)
      continue
    }
    resolved[key] = parseOrThrow(endpointUrlSchema, value, `endpoint ${key}`)
  }

  if (missing.length > 0) {
    throw new NetworkConfigError(
      `Network ${network} has no endpoint configured for: ${missing.join(', ')}. ` +
        `Deploy the service and add it to NETWORKS, or pass an override.`,
    )
  }

  return resolved as Record<keyof NetworkEndpoints, string>
}

const assertEnsV2Deployed = (
  network: EnsNetwork,
  // Deliberately loose: the literal address types of a concrete chain make
  // TypeScript consider the zero-address comparison impossible, but whether a
  // contract is deployed is exactly the runtime question being asked.
  contracts: Record<string, { readonly address: string } | undefined>,
): void => {
  const undeployed = REQUIRED_ENSV2_CONTRACTS.filter(
    (name) => contracts[name]?.address?.toLowerCase() === zeroAddress,
  )
  if (undeployed.length > 0) {
    throw new NetworkConfigError(
      `ENSv2 is not deployed on ${network}: ${undeployed.join(', ')} ` +
        `resolve to the zero address. Building against this network would ` +
        `send calls to 0x0.`,
    )
  }
}

/**
 * Resolve the application configuration for one network.
 *
 * Pure: it reads no environment and creates no clients, so it is safe to call
 * from the browser, a Cloudflare Worker, the api-worker and tests alike. Each
 * app reads its own env at its composition root and passes the values in.
 */
export const buildConfig = ({
  network: requestedNetwork,
  rpcUrl,
  overrides,
}: BuildConfigInput): EnsAppConfig => {
  const network = resolveNetwork(requestedNetwork)
  const profile = NETWORKS[network]

  const primaryRpcUrl =
    rpcUrl === undefined
      ? undefined
      : parseOrThrow(endpointUrlSchema, rpcUrl, 'rpcUrl')
  const rpcUrls = orderedRpcUrls(primaryRpcUrl, profile.rpcFallbacks)

  const endpoints = resolveEndpoints(network, overrides)

  const chain = buildEnsChain(network, rpcUrls)

  assertEnsV2Deployed(network, chain.contracts)

  return Object.freeze({
    network,
    isTestnet: profile.isTestnet,
    chain: chain as EnsChain,
    rpcUrls: Object.freeze(rpcUrls),
    rpcFallbacks: profile.rpcFallbacks,
    endpoints: Object.freeze(endpoints),
  })
}
