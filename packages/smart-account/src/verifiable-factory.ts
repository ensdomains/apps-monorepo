import {
  type Address,
  concatHex,
  decodeEventLog,
  encodeAbiParameters,
  getContractAddress,
  type Hex,
  isAddressEqual,
  keccak256,
  parseAbi,
} from 'viem'

const VERIFIABLE_PROXY_PREFIX =
  '0x3d604d80600a3d3981f3363d3d373d3d3d363d73' as const
const VERIFIABLE_PROXY_SUFFIX = '0x5af43d82803e903d91602b57fd5bf3' as const

export type ComputeVerifiableProxyAddressParams = {
  /** VerifiableFactory that executes CREATE2. */
  readonly factory: Address
  /** Factory-specific proxy logic embedded in the proxy creation bytecode. */
  readonly proxyLogic: Address
  /** Immediate caller of `VerifiableFactory.deployProxy`. */
  readonly deployer: Address
  /** Application salt passed to `VerifiableFactory.deployProxy`. */
  readonly salt: bigint
}

/**
 * Derive the deterministic proxy address produced by VerifiableFactory.
 *
 * VerifiableFactory namespaces the supplied salt by `msg.sender`, so callers
 * must provide the contract or account that will call `deployProxy`, not the
 * eventual proxy owner.
 */
export function computeVerifiableProxyAddress(
  params: ComputeVerifiableProxyAddressParams,
): Address {
  const outerSalt = keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }],
      [params.deployer, params.salt],
    ),
  )
  const bytecode = concatHex([
    VERIFIABLE_PROXY_PREFIX,
    params.proxyLogic,
    VERIFIABLE_PROXY_SUFFIX,
    outerSalt,
  ])

  return getContractAddress({
    bytecode,
    from: params.factory,
    opcode: 'CREATE2',
    salt: outerSalt,
  })
}

const proxyDeployedAbi = parseAbi([
  'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)',
])

/** The parts of a receipt log this reader needs. */
export interface ProxyDeployedLogLike {
  readonly address: Address
  readonly topics: readonly Hex[]
  readonly data: Hex
}

export interface FindDeployedProxyAddressParams {
  /** Every log in the transaction that carried the deploy. */
  readonly logs: readonly ProxyDeployedLogLike[]
  /** The `VerifiableFactory` that must be the emitter. */
  readonly factory: Address
}

/**
 * The proxy `factory` deployed in `logs`, or `null` when it emitted none.
 *
 * A Safe's execution can be carried by an arbitrary transaction, so a
 * `ProxyDeployed` from any other contract is not ours: only logs emitted by
 * the factory count. More than one is refused rather than guessed between.
 */
export function findDeployedProxyAddress({
  logs,
  factory,
}: FindDeployedProxyAddressParams): Address | null {
  const deployed: Address[] = []

  for (const log of logs) {
    if (!isAddressEqual(log.address, factory) || log.topics.length === 0) {
      continue
    }
    try {
      const decoded = decodeEventLog({
        abi: proxyDeployedAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      })
      if (decoded.eventName === 'ProxyDeployed') {
        deployed.push(decoded.args.proxyAddress)
      }
    } catch {
      // A log from the factory that is not ProxyDeployed.
    }
  }

  if (deployed.length > 1) {
    throw new Error(
      `Expected one ProxyDeployed log from ${factory}, found ${deployed.length}`,
    )
  }

  return deployed[0] ?? null
}
