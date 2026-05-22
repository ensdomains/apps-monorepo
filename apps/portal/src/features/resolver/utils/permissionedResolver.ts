import {
  proxyInitializeSnippet,
  verifiableFactoryDeployProxySnippet,
} from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import {
  type Address,
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  type Hex,
  keccak256,
  stringToBytes,
} from 'viem'

const permissionedResolverRoleBitmap = BigInt(
  '0x1111111111111111111111111111111111111111111111111111111111111111',
)

export const generateResolverSalt = (name: string) => {
  const timestamp = new Date().toISOString()
  return BigInt(keccak256(stringToBytes(`${name}:${timestamp}`)))
}

export const getResolverInitCalldata = (ownerAddress: Address): Hex => {
  return encodeFunctionData({
    abi: proxyInitializeSnippet,
    functionName: 'initialize',
    args: [ownerAddress, permissionedResolverRoleBitmap],
  })
}

export const parseProxyDeployedAddress = (
  logs: readonly { topics: readonly Hex[]; data: Hex }[],
): Address | null => {
  for (const log of logs) {
    if (log.topics.length === 0) continue

    try {
      const decoded = decodeEventLog({
        abi: verifiableFactoryDeployProxySnippet,
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
