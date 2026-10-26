import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { type Address, type Hex, encodeFunctionData, labelhash, namehash, parseAbi, zeroAddress } from 'viem'
import { publicClient } from '../../helpers/anvil-client.js'
import { V1_BASE_REGISTRAR, V1_ENS_REGISTRY, V1_NAME_WRAPPER, V1_PUBLIC_RESOLVER } from '../../fixtures/makeV1Name.js'
import { dnsEncode } from '../../helpers/resolve-records.js'
import { account, type seedConfiguration } from './seed.js'

type Fixture = Awaited<ReturnType<typeof seedConfiguration>>
export type Probe = { result: 'ALLOWED' | 'DENIED' | 'BLOCKED'; detail?: string }
const registry = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry.address
const v2ABI = parseAbi([
  'struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }',
  'function getState(uint256 id) view returns(State)',
  'function getSubregistry(string label) view returns(address)',
  'function getResolver(string label) view returns(address)',
  'function setResolver(uint256 id,address resolver)',
  'function roles(uint256 resource,address user) view returns(uint256)',
  'function safeTransferFrom(address from,address to,uint256 id,uint256 amount,bytes data)',
  'function unsafeTransfer(address to,uint256 tokenId,bytes data)',
  'function grantRoles(uint256 resource,uint256 roles,address user) returns(bool)',
  'function unregister(uint256 tokenId)',
  'function setSubregistry(uint256 tokenId,address registry)',
  'function register(string label,address owner,address registry,address resolver,uint256 roleBitmap,uint64 expiry) returns(uint256)',
])
const registryV1ABI = parseAbi([
  'function setResolver(bytes32 node,address resolver)',
  'function setOwner(bytes32 node,address owner)',
  'function setRecord(bytes32 node,address owner,address resolver,uint64 ttl)',
  'function setSubnodeOwner(bytes32 node,bytes32 label,address owner) returns(bytes32)',
])
const wrapperABI = parseAbi([
  'function setResolver(bytes32 node,address resolver)',
  'function safeTransferFrom(address from,address to,uint256 id,uint256 amount,bytes data)',
  'function setSubnodeOwner(bytes32 node,string label,address owner,uint32 fuses,uint64 expiry) returns(bytes32)',
  'function setRecord(bytes32 node,address owner,address resolver,uint64 ttl)',
])
const baseABI = parseAbi(['function transferFrom(address from,address to,uint256 id)', 'function reclaim(uint256 id,address owner)'])
const legacyResolverABI = parseAbi(['function setText(bytes32 node,string key,string value)'])
const newResolverABI = parseAbi(['function setText(bytes name,string key,string value)', 'function roles(uint256 resource,address user) view returns(uint256)'])

/** A denied call must be an actual EVM revert. Network/decoding errors are never denial passes. */
async function probe(who: Address, to: Address, data: Hex): Promise<Probe> {
  try {
    await publicClient.call({ account: who, to, data, gas: 5_000_000n })
    return { result: 'ALLOWED' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const reverted = /execution reverted|reverted with|reverted for an unknown reason|VM Exception.*revert/i.test(message)
    return { result: reverted ? 'DENIED' : 'BLOCKED', detail: message.slice(0, 4000) }
  }
}

export async function v2State(name: string) {
  const labels = name.split('.').slice(0, -1).reverse()
  let address: Address = registry
  for (const label of labels.slice(0, -1)) {
    address = await publicClient.readContract({ address, abi: v2ABI, functionName: 'getSubregistry', args: [label] })
    if (address === zeroAddress) return null
  }
  const label = labels.at(-1)!
  const state = await publicClient.readContract({ address, abi: v2ABI, functionName: 'getState', args: [BigInt(labelhash(label))] })
  return { registry: address, label, ...state }
}

export async function beforePermissions(f: Fixture, actor: string) {
  const who = account(actor).address
  const node = namehash(f.leaf)
  const holder = f.holderFor(f.leaf).address
  const wrapped = f.wrappedFor(f.leaf)
  const records = await probe(who, V1_PUBLIC_RESOLVER, encodeFunctionData({ abi: legacyResolverABI, functionName: 'setText', args: [node, 'description', f.records.texts![1].value] }))
  const setResolver = await probe(who, wrapped ? V1_NAME_WRAPPER : V1_ENS_REGISTRY, encodeFunctionData({ abi: registryV1ABI, functionName: 'setResolver', args: [node, V1_PUBLIC_RESOLVER] }))
  const transfer = wrapped
    ? await probe(who, V1_NAME_WRAPPER, encodeFunctionData({ abi: wrapperABI, functionName: 'safeTransferFrom', args: [holder, account('Unrelated').address, BigInt(node), 1n, '0x'] }))
    : f.c.level === '2LD'
      ? await probe(who, V1_BASE_REGISTRAR, encodeFunctionData({ abi: baseABI, functionName: 'transferFrom', args: [account(f.c.root_owner).address, account('Unrelated').address, BigInt(labelhash(f.label))] }))
      : await probe(who, V1_ENS_REGISTRY, encodeFunctionData({ abi: registryV1ABI, functionName: 'setOwner', args: [node, account('Unrelated').address] }))
  const createSubname = wrapped
    ? await probe(who, V1_NAME_WRAPPER, encodeFunctionData({ abi: wrapperABI, functionName: 'setSubnodeOwner', args: [node, 'permission-probe', holder, 0, f.expiry] }))
    : await probe(who, V1_ENS_REGISTRY, encodeFunctionData({ abi: registryV1ABI, functionName: 'setSubnodeOwner', args: [node, labelhash('permission-probe'), holder] }))
  const editManager = !wrapped ? await probe(who, V1_ENS_REGISTRY, encodeFunctionData({ abi: registryV1ABI, functionName: 'setOwner', args: [node, account('Unrelated').address] })) : undefined
  const deleteAsHolder = f.c.level !== '2LD' ? await probe(who, wrapped ? V1_NAME_WRAPPER : V1_ENS_REGISTRY, encodeFunctionData({ abi: registryV1ABI, functionName: 'setRecord', args: [node, zeroAddress, zeroAddress, 0n] })) : undefined
  let reclaim: Probe | undefined
  let assignManagerAsOwner: Probe | undefined
  let deleteAsParent: Probe | undefined
  let transferAsParent: Probe | undefined
  if (f.c.level === '2LD' && !wrapped) {
    reclaim = await probe(who, V1_BASE_REGISTRAR, encodeFunctionData({ abi: baseABI, functionName: 'reclaim', args: [BigInt(labelhash(f.label)), who] }))
    assignManagerAsOwner = await probe(who, V1_BASE_REGISTRAR, encodeFunctionData({ abi: baseABI, functionName: 'reclaim', args: [BigInt(labelhash(f.label)), account('Unrelated').address] }))
  }
  if (f.c.level !== '2LD') {
    const parent = f.leaf.split('.').slice(1).join('.')
    const parentWrapped = f.wrappedFor(parent)
    // Match the app's reassignment intent, including zero fuses/expiry to
    // preserve the child's existing values. The child's contract is used:
    // crossing wrapper boundaries is not equivalent to a preserving transfer.
    transferAsParent = await probe(who, wrapped ? V1_NAME_WRAPPER : V1_ENS_REGISTRY, wrapped
      ? encodeFunctionData({ abi: wrapperABI, functionName: 'setSubnodeOwner', args: [namehash(parent), f.leaf.split('.')[0], account('Unrelated').address, 0, 0n] })
      : encodeFunctionData({ abi: registryV1ABI, functionName: 'setSubnodeOwner', args: [namehash(parent), labelhash(f.leaf.split('.')[0]), account('Unrelated').address] }))
    reclaim = await probe(who, parentWrapped ? V1_NAME_WRAPPER : V1_ENS_REGISTRY, parentWrapped
      ? encodeFunctionData({ abi: wrapperABI, functionName: 'setSubnodeOwner', args: [namehash(parent), f.leaf.split('.')[0], who, 0, f.expiry] })
      : encodeFunctionData({ abi: registryV1ABI, functionName: 'setSubnodeOwner', args: [namehash(parent), labelhash(f.leaf.split('.')[0]), who] }))
    deleteAsParent = await probe(who, parentWrapped ? V1_NAME_WRAPPER : V1_ENS_REGISTRY, parentWrapped
      ? encodeFunctionData({ abi: wrapperABI, functionName: 'setSubnodeOwner', args: [namehash(parent), f.leaf.split('.')[0], zeroAddress, 0, f.expiry] })
      : encodeFunctionData({ abi: registryV1ABI, functionName: 'setSubnodeOwner', args: [namehash(parent), labelhash(f.leaf.split('.')[0]), zeroAddress] }))
  }
  return { records, setResolver, transfer, transferAsParent, createSubname, editManager, assignManagerAsOwner, reclaim, deleteAsHolder, deleteAsParent, layer: 'eth_call authorization simulation; no committed mutation' }
}

export async function afterPermissions(f: Fixture, actor: string) {
  const state = await v2State(f.leaf)
  if (!state || state.status !== 2) return null
  const who = account(actor).address
  const resolver = await publicClient.readContract({ address: state.registry, abi: v2ABI, functionName: 'getResolver', args: [state.label] })
  const legacy = resolver.toLowerCase() === V1_PUBLIC_RESOLVER.toLowerCase()
  const records = await probe(who, resolver, legacy
    ? encodeFunctionData({ abi: legacyResolverABI, functionName: 'setText', args: [namehash(f.leaf), 'description', f.records.texts![1].value] })
    : encodeFunctionData({ abi: newResolverABI, functionName: 'setText', args: [dnsEncode(f.leaf), 'description', f.records.texts![1].value] }))
  const setResolver = await probe(who, state.registry, encodeFunctionData({ abi: v2ABI, functionName: 'setResolver', args: [state.tokenId, resolver] }))
  const transfer = await probe(who, state.registry, encodeFunctionData({ abi: v2ABI, functionName: 'safeTransferFrom', args: [state.latestOwner, account('Unrelated').address, state.tokenId, 1n, '0x'] }))
  const registryRoles = await publicClient.readContract({ address: state.registry, abi: v2ABI, functionName: 'roles', args: [state.resource, who] })
  const resolverRoles = legacy ? null : await publicClient.readContract({ address: resolver, abi: newResolverABI, functionName: 'roles', args: [0n, who] }).catch(() => null)
  const unsafeTransfer = await probe(who, state.registry, encodeFunctionData({ abi: v2ABI, functionName: 'unsafeTransfer', args: [account('Unrelated').address, state.tokenId, '0x'] }))
  const grantResolverRole = await probe(who, state.registry, encodeFunctionData({ abi: v2ABI, functionName: 'grantRoles', args: [state.resource, 1n << 24n, account('Unrelated').address] }))
  const unregister = await probe(who, state.registry, encodeFunctionData({ abi: v2ABI, functionName: 'unregister', args: [state.tokenId] }))
  const subregistry = await publicClient.readContract({ address: state.registry, abi: v2ABI, functionName: 'getSubregistry', args: [state.label] })
  const createSubname = subregistry !== zeroAddress ? await probe(who, subregistry, encodeFunctionData({ abi: v2ABI, functionName: 'register', args: ['permission-probe', who, zeroAddress, resolver, 0x1111111n, (1n << 64n) - 1n] })) : undefined
  const setSubregistry = await probe(who, state.registry, encodeFunctionData({ abi: v2ABI, functionName: 'setSubregistry', args: [state.tokenId, subregistry] }))
  return { records, setResolver, transfer, unsafeTransfer, grantResolverRole, unregister, createSubname, setSubregistry, subregistry, registryRoles, resolverRoles, resolver, layer: 'eth_call authorization simulation + exact role read; no committed mutation' }
}
