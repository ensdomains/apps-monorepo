import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { permissionedResolverInitializeSnippet } from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import { verifiableFactoryVerifyContractSnippet } from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import {
  type Address,
  bytesToHex,
  type Chain,
  type Client,
  ContractFunctionRevertedError,
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  type Hex,
  keccak256,
  parseAbi,
  stringToBytes,
  type Transport,
} from 'viem'
import { getStorageAt, readContract } from 'viem/actions'

const permissionedResolverRoleBitmap = BigInt(
  '0x1111111111111111111111111111111111111111111111111111111111111111',
)

const verifiableFactoryAbi = parseAbi([
  'function deployProxy(address implementation, uint256 salt, bytes data)',
  'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)',
])

export const generateResolverSalt = (name: string) => {
  // Use CSPRNG (not `Date.now()`/`Math.random()`) so the resolver salt is
  // unpredictable. The CREATE2 address is also bound to the deployer via
  // `keccak256(abi.encode(msg.sender, salt))`, but unpredictable randomness is
  // the correct hygiene for any on-chain-influencing value.
  const randomBytes = crypto.getRandomValues(new Uint8Array(32))
  return BigInt(keccak256(stringToBytes(`${name}:${bytesToHex(randomBytes)}`)))
}

/**
 * `PermissionedResolver.initialize(Grant[] grants, bytes[] calls)`. The proxy is
 * deployed with no initial records, so `calls` is empty.
 */
export const getResolverInitCalldata = (ownerAddress: Address): Hex => {
  return encodeFunctionData({
    abi: permissionedResolverInitializeSnippet,
    functionName: 'initialize',
    args: [
      [{ account: ownerAddress, roleBitmap: permissionedResolverRoleBitmap }],
      [],
    ],
  })
}

export const parseProxyDeployedAddress = (
  logs: readonly { topics: readonly Hex[]; data: Hex }[],
): Address | null => {
  for (const log of logs) {
    if (log.topics.length === 0) continue

    try {
      const decoded = decodeEventLog({
        abi: verifiableFactoryAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      })

      if (decoded.eventName === 'ProxyDeployed') {
        return decoded.args.proxyAddress
      }
    } catch {
      // Ignore logs that don't match ProxyDeployed
    }
  }

  return null
}

export const decodeImplementationAddress = (
  storageValue: Hex | null | undefined,
): Address | null => {
  if (!storageValue || storageValue === '0x' || /^0x0+$/.test(storageValue)) {
    return null
  }

  const normalized = storageValue.slice(2).padStart(64, '0')
  const rawAddress = `0x${normalized.slice(24)}` as Address

  try {
    return getAddress(rawAddress)
  } catch {
    return null
  }
}

export interface ProxyDeployedLog {
  readonly args: {
    readonly implementation: Address
    readonly proxyAddress: Address
  }
}

export const filterPermissionedResolverAddresses = (
  logs: readonly ProxyDeployedLog[],
  expectedImplementation: Address,
): Address[] => {
  const addresses: Address[] = []
  const seen = new Set<string>()

  for (const log of [...logs].reverse()) {
    if (
      log.args.implementation.toLowerCase() !==
      expectedImplementation.toLowerCase()
    ) {
      continue
    }

    const normalized = log.args.proxyAddress.toLowerCase()
    if (seen.has(normalized)) continue

    seen.add(normalized)
    addresses.push(log.args.proxyAddress)
  }

  return addresses
}

const EIP1967_IMPLEMENTATION_SLOT: Hex =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

/**
 * Whether the call came back FROM the contract rather than failing to reach it.
 * Walked by hand and matched on name and EIP-1474 code as well as class: viem
 * wraps the revert at a depth it does not fix, and class identity does not
 * survive the production build.
 */
const isRevert = (error: unknown): boolean => {
  let current: unknown = error
  for (let depth = 0; depth < 10 && current != null; depth += 1) {
    if (current instanceof ContractFunctionRevertedError) return true
    const { name, code } = current as { name?: unknown; code?: unknown }
    if (name === 'ContractFunctionRevertedError') return true
    // -32000/3: the node executed the call and it reverted.
    if (code === 3) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

export interface GetVerifiedProxyImplementationParams {
  readonly client: Client
  readonly factoryAddress: Address
  readonly proxyAddress: Address
}

/**
 * The implementation a factory-deployed proxy currently delegates to, or null
 * when the factory will not vouch for `proxyAddress`. It recomputes the CREATE2
 * address from the salt in the proxy's own bytecode, so only a proxy it
 * deployed can pass, and it reverts rather than answering for anything else.
 */
export const getVerifiedProxyImplementation = async ({
  client,
  factoryAddress,
  proxyAddress,
}: GetVerifiedProxyImplementationParams): Promise<Address | null> =>
  readContract(client, {
    address: factoryAddress,
    abi: verifiableFactoryVerifyContractSnippet,
    functionName: 'verifyContract',
    args: [proxyAddress],
  }).catch((error: unknown) => {
    // A revert IS the answer: the factory refuses to vouch for this proxy.
    // A transport failure is not, and must not quietly cost a genuine proxy
    // its badge, so it propagates to the caller's error handling.
    if (isRevert(error)) return null
    throw error
  })

/**
 * Whether `address` is a PermissionedResolver this app will trust.
 *
 * Both conditions have to hold: the EIP-1967 slot names the implementation we
 * expect, and the factory vouches for the proxy. The slot alone is metadata the
 * contract writes about itself, so it only narrows the candidates.
 *
 * The chain comes off `client` so every caller answers for the chain it is
 * actually reading, rather than one pinned at module scope.
 */
/** A chain carrying the two contracts this check reads. */
export type PermissionedResolverChain = Chain & {
  readonly contracts: {
    readonly ensPermissionedResolverImpl: { readonly address: Address }
    readonly ensVerifiableFactory: { readonly address: Address }
  }
}

export const isVerifiedPermissionedResolver = async ({
  client,
  address,
}: {
  readonly client: Client<Transport, PermissionedResolverChain>
  readonly address: Address
}): Promise<boolean> => {
  const knownImplementation = getChainContractAddress({
    chain: client.chain,
    contract: 'ensPermissionedResolverImpl',
  }).toLowerCase()

  if (address.toLowerCase() === knownImplementation) return true

  const slotValue = await getStorageAt(client, {
    address,
    slot: EIP1967_IMPLEMENTATION_SLOT,
  })
  const implementation = decodeImplementationAddress(slotValue)
  if (implementation?.toLowerCase() !== knownImplementation) return false

  const verified = await getVerifiedProxyImplementation({
    client,
    factoryAddress: getChainContractAddress({
      chain: client.chain,
      contract: 'ensVerifiableFactory',
    }),
    proxyAddress: address,
  })
  return verified?.toLowerCase() === knownImplementation
}
