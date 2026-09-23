import { ensL1Contracts } from '@ensdomains/ensjs/chain'
import type { Address } from 'viem'
import { NetworkConfigError } from './errors'
import { type EnsNetwork, NETWORKS } from './networks'

/**
 * Addresses the canonical deployment publishes but ensjs does not yet carry.
 *
 * Temporary. ensdomains/ensjs#387 adds all three to the L1 chain config; once
 * that lands and the catalog pin moves, this map and `requireExtra` go away
 * and every address comes from ensjs.
 *
 * `null` means no deployment exists for that network. Reading a null through
 * `getEnsContracts` throws rather than returning a placeholder, for the same
 * reason the ENSv2 guard exists: a zero or absent address produces calldata
 * that looks valid and goes nowhere.
 */
const EXTRA_CONTRACTS = {
  mainnet: {
    defaultReverseRegistrar: null,
    defaultReverseRegistrarAdapter: null,
    reverseRegistrarAdapter: null,
  },
  sepolia: {
    // ENSIP-19 `default.reverse`, which sets the primary name per coin type.
    // This is the registrar the canonical deployment's adapter wraps (its
    // public immutable `DEFAULT_REVERSE_REGISTRAR`), NOT the superseded
    // `0xeb8269fb…` standalone deployment, whose records nothing in the
    // canonical resolution path reads.
    defaultReverseRegistrar: '0x4F382928805ba0e23B30cFB75fC9E848e82DFD47',
    // HCA forwarders for the two v1 reverse registrars (contracts-v2
    // `deployments/sepolia` @ 71a3b733). Each resolves the calling HCA's owner
    // through its STANDALONE_HCA_FACTORY, so they must match the ensjs
    // `ensHcaFactory` address for the same network.
    defaultReverseRegistrarAdapter:
      '0x4F32A1c62E202922d4d6307126F43218DB9dA6f5',
    reverseRegistrarAdapter: '0x39993148CAA6a20aE1F08E1b2427966E97f85aaB',
  },
} as const satisfies Record<EnsNetwork, Record<string, `0x${string}` | null>>

export type EnsContracts = {
  readonly ETHRegistrarController: Address
  readonly ETHRenewerV1: Address
  readonly PublicResolver: Address
  readonly ReverseRegistrar: Address
  readonly LegacyRegistry: Address
  readonly ETHRegistry: Address
  readonly ETHRegistrar: Address
  /**
   * The v2 resolver implementation proxied by VerifiableFactory. This is
   * `PermissionedResolver`, NOT namechain's `DedicatedResolver`, which is a
   * different contract with its own interface id (0x92349baa).
   */
  readonly PermissionedResolverImpl: Address
  readonly VerifiableFactory: Address
  readonly StandardRentPriceOracle: Address
  readonly HCAFactory: Address
  readonly DefaultReverseRegistrar: Address
  readonly DefaultReverseRegistrarAdapter: Address
  readonly ReverseRegistrarAdapter: Address
}

const NETWORK_BY_CHAIN_ID = new Map<number, EnsNetwork>(
  (Object.keys(NETWORKS) as EnsNetwork[]).map((network) => [
    NETWORKS[network].chainId,
    network,
  ]),
)

const requireExtra = (
  value: string | null,
  name: string,
  network: EnsNetwork,
): Address => {
  if (!value) {
    throw new NetworkConfigError(
      `${name} has no deployment on ${network}. Publish it and add it to EXTRA_CONTRACTS.`,
    )
  }
  return value as Address
}

/**
 * ENS contract addresses for a chain.
 *
 * Pure and chain-keyed, so callers resolve contracts from whatever chain they
 * already hold rather than from a module-level constant pinned to one network.
 * Throws for a chain with no ENS deployment instead of falling back.
 *
 * The three reverse-registrar addresses ensjs does not carry are lazy: a
 * network that has not published them yet must not block a caller that only
 * wants a canonical contract such as `ETHRegistrar`. Reading one of those
 * properties on such a network is what throws.
 */
export const getEnsContracts = (chainId: number): EnsContracts => {
  const network = NETWORK_BY_CHAIN_ID.get(chainId)
  if (!network) {
    throw new NetworkConfigError(
      `Chain ${chainId} has no ENS deployment. Refusing to guess a network.`,
    )
  }

  const ens = ensL1Contracts[NETWORKS[network].chainId]
  const extra = EXTRA_CONTRACTS[network]

  return {
    ETHRegistrarController: ens.ensEthRegistrarController.address,
    ETHRenewerV1: ens.ensEthRenewerV1.address,
    PublicResolver: ens.ensPublicResolver.address,
    ReverseRegistrar: ens.ensReverseRegistrar.address,
    LegacyRegistry: ens.ensLegacyRegistry.address,
    ETHRegistry: ens.ensRegistry.address,
    ETHRegistrar: ens.ensEthRegistrar.address,
    PermissionedResolverImpl: ens.ensPermissionedResolverImpl.address,
    VerifiableFactory: ens.ensVerifiableFactory.address,
    StandardRentPriceOracle: ens.ensStandardRentPriceOracle.address,
    HCAFactory: ens.ensHcaFactory.address,
    get DefaultReverseRegistrar() {
      return requireExtra(
        extra.defaultReverseRegistrar,
        'DefaultReverseRegistrar',
        network,
      )
    },
    get DefaultReverseRegistrarAdapter() {
      return requireExtra(
        extra.defaultReverseRegistrarAdapter,
        'DefaultReverseRegistrarAdapter',
        network,
      )
    },
    get ReverseRegistrarAdapter() {
      return requireExtra(
        extra.reverseRegistrarAdapter,
        'ReverseRegistrarAdapter',
        network,
      )
    },
  }
}

/**
 * Payment tokens the v2 registrar actually accepts (its `PAYMENT_TOKEN` /
 * `SECONDARY_PAYMENT_TOKEN` slots). DAI is deliberately absent: offering it in
 * a picker produces quotes the registrar rejects at settlement.
 */
export const getSupportedTokens = (chainId: number) => {
  const network = NETWORK_BY_CHAIN_ID.get(chainId)
  if (!network) {
    throw new NetworkConfigError(`Chain ${chainId} has no ENS deployment.`)
  }
  return {
    USDC: ensL1Contracts[NETWORKS[network].chainId].usdc.address,
  } as const
}

/**
 * Every token the apps can price or display. Broader than
 * {@link getSupportedTokens} because the portal still offers DAI in its own
 * picker. Adding an entry here does NOT make it a valid payment token.
 */
export const getTokens = (chainId: number) => {
  const network = NETWORK_BY_CHAIN_ID.get(chainId)
  if (!network) {
    throw new NetworkConfigError(`Chain ${chainId} has no ENS deployment.`)
  }
  const ens = ensL1Contracts[NETWORKS[network].chainId]
  return {
    USDC: { address: ens.usdc.address, decimals: 6, symbol: 'USDC' },
    DAI: { address: ens.dai.address, decimals: 18, symbol: 'DAI' },
  } as const
}

export type TOKEN_SYMBOL = keyof ReturnType<typeof getTokens>
export type SUPPORTED_TOKEN = keyof ReturnType<typeof getSupportedTokens>
export type SUPPORTED_TOKEN_ADDRESS = Address
