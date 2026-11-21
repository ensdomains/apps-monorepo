import { fromSync } from '@ens-apps/utils/neverthrow'
import { err, ok, Result } from 'neverthrow'
import {
  type Address,
  concatHex,
  type DecodeEventLogErrorType,
  decodeEventLog,
  encodeAbiParameters,
  getContractAddress,
  type Hex,
  isAddressEqual,
  keccak256,
  parseAbi,
  toEventSelector,
} from 'viem'
import {
  AmbiguousProxyDeploymentError,
  DecodeProxyDeployedError,
} from './errors'

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

const PROXY_DEPLOYED_TOPIC = toEventSelector(proxyDeployedAbi[0])

function decodeProxyDeployed(
  log: ProxyDeployedLogLike,
): Result<Address, DecodeProxyDeployedError> {
  return fromSync(
    () =>
      decodeEventLog({
        abi: proxyDeployedAbi,
        eventName: 'ProxyDeployed',
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      }).args.proxyAddress,
    (error) =>
      new DecodeProxyDeployedError({
        message: `Could not decode ProxyDeployed from ${log.address}`,
        cause: error as DecodeEventLogErrorType,
      }),
  )
}

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
}: FindDeployedProxyAddressParams): Result<
  Address | null,
  DecodeProxyDeployedError | AmbiguousProxyDeploymentError
> {
  const factoryLogs = logs.filter(
    (log) =>
      isAddressEqual(log.address, factory) &&
      log.topics[0] === PROXY_DEPLOYED_TOPIC,
  )

  return Result.combine(factoryLogs.map(decodeProxyDeployed)).andThen(
    (deployed) =>
      deployed.length > 1
        ? err(
            new AmbiguousProxyDeploymentError({
              message: `Expected one ProxyDeployed log from ${factory}, found ${deployed.length}`,
              factory,
              count: deployed.length,
            }),
          )
        : ok(deployed[0] ?? null),
  )
}
