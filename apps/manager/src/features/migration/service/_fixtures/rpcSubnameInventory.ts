import type { V1Domain } from '@ens-apps/migration'
import { type Address, isAddress, labelhash, namehash, zeroAddress } from 'viem'
import { envConfig } from '@/config'
import { V1_CONTRACTS } from '../../contracts/addresses'
import type {
  RpcSubnameInventory,
  RpcSubnameSource,
} from '../readRpcSubnameInventory'

const address = (value: string): Address => {
  if (!isAddress(value)) throw new Error(`Invalid fixture address: ${value}`)
  return value
}

export const makeRpcSubnameInventory = (params: {
  readonly domains: readonly V1Domain[]
  readonly rootNames: readonly string[]
  readonly blockNumber?: bigint
  readonly timestamp?: bigint
}): RpcSubnameInventory => {
  const roots = new Set(params.rootNames)
  const source = (domain: V1Domain): RpcSubnameSource => ({
    node: namehash(domain.name),
    name: domain.name,
    registryOwner: address(domain.owner.id),
    resolver: address(domain.resolver?.address ?? zeroAddress),
    wrappedData: domain.wrappedDomain
      ? [
          address(domain.wrappedOwner?.id ?? zeroAddress),
          domain.wrappedDomain.fuses,
          BigInt(domain.wrappedDomain.expiryDate),
        ]
      : null,
  })
  return {
    chainId: envConfig.chain.id,
    registryAddress: V1_CONTRACTS.LegacyRegistry,
    nameWrapperAddress: V1_CONTRACTS.NameWrapper,
    checkpoint: {
      number: params.blockNumber ?? 100n,
      hash: namehash('rpc-fixture-block'),
      timestamp: params.timestamp ?? 1000n,
    },
    registries: [{ address: V1_CONTRACTS.LegacyRegistry }],
    roots: params.rootNames.map((name) => ({ node: namehash(name), name })),
    rootSources: params.domains
      .filter(({ name }) => roots.has(name))
      .map(source),
    nodes: params.domains
      .filter(({ name }) => !roots.has(name))
      .map((domain) => ({
        ...source(domain),
        parentNode: namehash(domain.name.slice(domain.name.indexOf('.') + 1)),
        labelhash: labelhash(domain.name.split('.')[0] ?? ''),
        depth: Math.max(
          ...params.rootNames
            .filter((root) => domain.name.endsWith(`.${root}`))
            .map(
              (root) => domain.name.split('.').length - root.split('.').length,
            ),
          1,
        ),
      })),
    scannedParentNodes: params.domains.map(({ name }) => namehash(name)),
    unscannedParentNodes: [],
  }
}
