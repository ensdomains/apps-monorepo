import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { zeroAddress } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { NetworkConfigError } from './errors'
import {
  ENS_NETWORKS,
  type EnsNetwork,
  isEnsNetwork,
  NETWORKS,
  type NetworkEndpoints,
} from './networks'

export { NetworkConfigError }

// ensjs carries every key on every network and fills undeployed contracts with
// the zero address, so a lookup returns 0x0 instead of throwing.
const REQUIRED_ENSV2_CONTRACTS = [
  'ensRegistry',
  'ensEthRegistrar',
  'ensStandardRentPriceOracle',
  'ensPermissionedResolverImpl',
  'ensVerifiableFactory',
  'ensDefaultReverseRegistrar',
  'ensDefaultReverseRegistrarAdapter',
  'ensReverseRegistrarAdapter',
] as const

const buildEnsChain = (network: EnsNetwork, rpcUrls: readonly string[]) => ({
  ...(network === 'mainnet'
    ? extendChainWithEns(mainnet)
    : extendChainWithEns(sepolia)),
  rpcUrls: {
    default: { http: rpcUrls },
    public: { http: rpcUrls },
  },
})

// Pinned to one instantiation: ensjs types its client as a union of concrete
// chains, so a chain typed as the union cannot flow into any ensjs action.
// Both chains share every key; only `id` and the addresses differ.
export type EnsChain = Extract<
  ReturnType<typeof buildEnsChain>,
  { id: 11155111 }
>

export type BuildConfigInput = {
  /** Network name, typically from env. No default: absent or unknown throws. */
  readonly network: string | undefined
  /** The app's own RPC endpoint. The network's public fallbacks follow it. */
  readonly rpcUrl?: string | undefined
  /** Per-endpoint overrides, typically from env. Empty or absent falls back. */
  readonly overrides?: Partial<
    Record<keyof NetworkEndpoints, string | undefined>
  >
}

export type EnsAppConfig = Readonly<{
  network: EnsNetwork
  isTestnet: boolean
  chain: EnsChain
  /** Primary first, then the network's public fallbacks, deduped. */
  rpcUrls: readonly string[]
  rpcFallbacks: readonly string[]
  endpoints: Readonly<Record<keyof NetworkEndpoints, string>>
}>

// Absolute http(s), or root-relative like `/rpc` for the e2e proxy.
const isEndpointUrl = (value: string): boolean => {
  if (value.startsWith('/')) return true
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

const requireUrl = (value: string, field: string): string => {
  const url = value.trim()
  if (!url || !isEndpointUrl(url)) {
    throw new NetworkConfigError(
      `Invalid ${field}: expected an absolute http(s) URL or a root-relative path, received ${JSON.stringify(value)}`,
    )
  }
  return url
}

const resolveNetwork = (network: string | undefined): EnsNetwork => {
  const expected = `Expected one of: ${ENS_NETWORKS.join(', ')}.`
  if (!network) throw new NetworkConfigError(`Missing network. ${expected}`)
  if (!isEnsNetwork(network)) {
    throw new NetworkConfigError(
      `Unknown network ${JSON.stringify(network)}. ${expected}`,
    )
  }
  return network
}

const resolveEndpoints = (
  network: EnsNetwork,
  overrides: BuildConfigInput['overrides'],
): Record<keyof NetworkEndpoints, string> => {
  const profile = NETWORKS[network].endpoints
  const keys = Object.keys(profile) as (keyof NetworkEndpoints)[]
  const resolved: Partial<Record<keyof NetworkEndpoints, string>> = {}
  const missing: string[] = []
  for (const key of keys) {
    // `||`: an override that is set but empty must fall through. A supplied
    // value is checked here, so a malformed one is reported even when another
    // endpoint is missing.
    const value = overrides?.[key] || profile[key]
    if (value) resolved[key] = requireUrl(value, `endpoint ${key}`)
    else missing.push(key)
  }
  if (missing.length > 0) {
    throw new NetworkConfigError(
      `Network ${network} has no endpoint configured for: ${missing.join(', ')}. Deploy the service and add it to NETWORKS, or pass an override.`,
    )
  }
  return resolved as Record<keyof NetworkEndpoints, string>
}

const assertEnsV2Deployed = (
  network: EnsNetwork,
  contracts: Record<string, { readonly address: string } | undefined>,
): void => {
  const undeployed = REQUIRED_ENSV2_CONTRACTS.filter((name) => {
    const address = contracts[name]?.address
    return !address || address.toLowerCase() === zeroAddress
  })
  if (undeployed.length > 0) {
    throw new NetworkConfigError(
      `ENSv2 is not deployed on ${network}: ${undeployed.join(', ')} resolve to the zero address. Building against this network would send calls to 0x0.`,
    )
  }
}

/** Primary first, then the fallbacks with the primary removed. */
export const orderedRpcUrls = (
  primary: string | undefined,
  fallbacks: readonly string[],
): readonly string[] => [
  ...(primary ? [primary] : []),
  ...fallbacks.filter((url) => url !== primary),
]

/**
 * Resolve the app configuration for one network. Pure: reads no env and
 * creates no clients, so it runs in the browser, both workers and tests.
 */
export const buildConfig = ({
  network: requestedNetwork,
  rpcUrl,
  overrides,
}: BuildConfigInput): EnsAppConfig => {
  const network = resolveNetwork(requestedNetwork)
  const profile = NETWORKS[network]

  const primaryRpcUrl = rpcUrl ? requireUrl(rpcUrl, 'rpcUrl') : undefined
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
