/**
 * Raw ENSv2 reads for #1494's chain oracles: registry state, role bitmaps,
 * and the complete set of role holders on a resource.
 *
 * Role holders are not enumerable on chain, so `roleHolders` replays the
 * contract's own `EACRolesChanged` stream. "Only the wallet and its HCA hold
 * root roles" is then a statement about every grant ever made, not about the
 * two accounts a test thought to ask about.
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import {
  type Address,
  keccak256,
  parseAbi,
  parseAbiItem,
  toHex,
} from 'viem'
import { getDestinationContracts } from '../../packages/smart-account/src/providers/rhinestone/manifest.ts'
import { publicClient } from './anvil-client.js'

export const V2_ETH_REGISTRY = ensL1Contracts[supportedL1Chains.sepolia]
  .ensRegistry.address as Address

export const ROOT_RESOURCE = 0n
/** contracts-v2 `ROLES.ALL`: one bit in every nybble. */
export const ROLES_ALL =
  0x1111111111111111111111111111111111111111111111111111111111111111n
/** The seven PermissionedResolver record setters, no admin bits. */
export const RECORD_SETTER_ROLES = 0x1111111n
export const ROLE_SET_RESOLVER = 1n << 24n
export const ROLE_LINK = 1n << 28n

export const REGISTRY_ABI = parseAbi([
  'struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }',
  'function getState(uint256 anyId) view returns (State state)',
  'function getSubregistry(string label) view returns (address)',
  'function getResolver(string label) view returns (address)',
  'function roles(uint256 resource, address account) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
  'function revokeRoles(uint256 resource, uint256 roleBitmap, address account) returns (bool)',
])

const ROLES_CHANGED = parseAbiItem(
  'event EACRolesChanged(uint256 indexed resource, address indexed account, uint256 oldRoleBitmap, uint256 newRoleBitmap)',
)

export const labelId = (label: string): bigint => BigInt(keccak256(toHex(label)))

const V1_BASE_REGISTRAR = ensL1Contracts[supportedL1Chains.sepolia]
  .ensBaseRegistrarImplementation.address as Address

/**
 * The BaseRegistrar expiry of `label.eth`, as unix seconds. The manager now
 * compares the indexed expiry with this value exactly, so a mock must serve
 * it rather than a placeholder.
 */
export async function v1Expiry(label: string): Promise<number> {
  const expiry = await publicClient.readContract({
    address: V1_BASE_REGISTRAR,
    abi: parseAbi(['function nameExpires(uint256 id) view returns (uint256)']),
    functionName: 'nameExpires',
    args: [labelId(label)],
  })
  return Number(expiry)
}

export async function registryState(registry: Address, label: string) {
  return publicClient.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: 'getState',
    args: [labelId(label)],
  })
}

export const ethRegistryState = (label: string) =>
  registryState(V2_ETH_REGISTRY, label)

export async function rolesOf(
  contract: Address,
  resource: bigint,
  account: Address,
): Promise<bigint> {
  return publicClient.readContract({
    address: contract,
    abi: REGISTRY_ABI,
    functionName: 'roles',
    args: [resource, account],
  })
}

const HCA_FACTORY = ensL1Contracts[supportedL1Chains.sepolia].ensHcaFactory
  .address as Address

/** The owner's HCA: what the factory's `deploy` returns, simulated only. */
export async function hcaOf(owner: Address): Promise<Address> {
  const implementation = getDestinationContracts(
    supportedL1Chains.sepolia,
  ).standaloneHcaImplementation
  const { result } = await publicClient.simulateContract({
    account: owner,
    address: HCA_FACTORY,
    abi: parseAbi([
      'function deploy(address owner, address hcaImplementation, uint256 userSalt) returns (address hca)',
    ]),
    functionName: 'deploy',
    args: [owner, implementation, 0n],
  })
  return result
}

/** The fork block: contracts the test deployed have no earlier history. */
async function forkBlock(): Promise<bigint> {
  const info = (await publicClient.request({
    method: 'anvil_nodeInfo',
  } as never)) as { forkConfig: { forkBlockNumber: number } }
  return BigInt(info.forkConfig.forkBlockNumber)
}

/**
 * Every account holding a non-zero bitmap on `resource`, from the event log.
 * Only for contracts deployed on the fork, whose whole history is local.
 */
export async function roleHolders(
  contract: Address,
  resource: bigint,
): Promise<Map<string, bigint>> {
  const logs = await publicClient.getLogs({
    address: contract,
    event: ROLES_CHANGED,
    args: { resource },
    fromBlock: (await forkBlock()) + 1n,
    toBlock: 'latest',
  })
  const holders = new Map<string, bigint>()
  for (const log of logs) {
    const account = (log.args.account ?? '').toLowerCase()
    const bitmap = log.args.newRoleBitmap ?? 0n
    if (bitmap === 0n) holders.delete(account)
    else holders.set(account, bitmap)
  }
  return holders
}
