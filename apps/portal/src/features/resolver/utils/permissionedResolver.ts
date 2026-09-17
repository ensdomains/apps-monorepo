import { permissionedResolverInitializeSnippet } from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import {
  type Address,
  bytesToHex,
  type Client,
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  type Hex,
  isAddressEqual,
  keccak256,
  parseAbi,
  stringToBytes,
  zeroAddress,
} from 'viem'
import { readContract } from 'viem/actions'

const permissionedResolverRoleBitmap = BigInt(
  '0x1111111111111111111111111111111111111111111111111111111111111111',
)

const verifiableFactoryAbi = parseAbi([
  'function deployProxy(address implementation, uint256 salt, bytes data)',
  'function verifyContract(address proxy) view returns (address implementation)',
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

export interface GetVerifiedProxyImplementationParams {
  readonly client: Client
  readonly factoryAddress: Address | undefined
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
}: GetVerifiedProxyImplementationParams): Promise<Address | null> => {
  if (!factoryAddress || isAddressEqual(factoryAddress, zeroAddress))
    return null

  return readContract(client, {
    address: factoryAddress,
    abi: verifiableFactoryAbi,
    functionName: 'verifyContract',
    args: [proxyAddress],
  }).catch(() => null)
}
