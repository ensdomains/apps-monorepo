import { type Hex, labelhash, namehash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
} from '../../../fixtures/makeV1Name.js'
import { makeV1RegistrySubname } from '../../../fixtures/makeV1RegistrySubname.js'
import {
  makeV1Subname,
  wrapV1SubnameOfUnwrapped,
} from '../../../fixtures/makeV1Subname.js'
import { setV1RecordsOn } from '../../../fixtures/v1-records.js'
import { splitController, unwrapChild } from '../../../fixtures/v1-tails.js'
import { publicClient, testClient } from '../../../helpers/anvil-client.js'
import type { PortalAccounts, User } from '../../../helpers/portal-auth.js'

export type LegacyName = {
  label: string
  type?: 'legacy' | 'wrapped'
  owner?: User
  manager?: User
  duration?: number
  fuses?: {
    named?: string[]
    parent?: { named?: string[] }
    child?: { named?: string[] }
  }
  records?: {
    texts?: { key: string; value: string }[]
    coins?: { coin: string; value: string }[]
  }
  subnames?: LegacyName[]
}
const fuseBits: Record<string, number> = {
  CANNOT_UNWRAP: 1,
  CANNOT_BURN_FUSES: 2,
  CANNOT_TRANSFER: 4,
  CANNOT_SET_RESOLVER: 8,
  CANNOT_SET_TTL: 16,
  CANNOT_CREATE_SUBDOMAIN: 32,
  CANNOT_APPROVE: 64,
  PARENT_CANNOT_CONTROL: 65536,
  CAN_EXTEND_EXPIRY: 262144,
}
const bitmap = (n: LegacyName) =>
  [
    ...(n.fuses?.named ?? []),
    ...(n.fuses?.parent?.named ?? []),
    ...(n.fuses?.child?.named ?? []),
  ].reduce((mask, key) => {
    if (!(key in fuseBits)) throw new Error(`Unsupported legacy fuse ${key}`)
    return mask | fuseBits[key]
  }, 0)

export async function seedLegacyTree(
  config: LegacyName,
  id: string,
  accounts: PortalAccounts,
) {
  const signer = (user: User = 'user') =>
    privateKeyToAccount(accounts.getPrivateKey(user))
  const owner = config.owner ?? 'user'
  const wrapped = config.type === 'wrapped'
  const root = await createMakeV1Name({ userAccount: signer(owner) })({
    label: id.toLowerCase(),
    type: wrapped ? 'wrapped' : 'unwrapped',
    fuses: bitmap(config),
    duration:
      config.duration && config.duration > 0
        ? Math.max(config.duration, 28 * 86400)
        : undefined,
  })
  const setRecords = async (
    name: string,
    node: LegacyName,
    user: User,
    isWrapped: boolean,
  ) => {
    await setV1RecordsOn(name, signer(user), isWrapped, {
      texts: node.records?.texts,
      addresses: [
        ...(name === root &&
        !isWrapped &&
        !(node.records?.coins ?? []).some((c) => c.coin.toLowerCase() === 'eth')
          ? [{ coin: 'eth', value: accounts.getAddress(user) }]
          : []),
        ...(node.records?.coins ?? []),
      ].map((c) => {
        const coinType = ({ eth: 60, etcLegacy: 61 } as Record<string, number>)[
          c.coin
        ]
        if (coinType === undefined)
          throw new Error(`Unsupported ownership fixture coin ${c.coin}`)
        return { coinType, value: c.value as Hex }
      }),
    })
  }
  await setRecords(root, config, owner, wrapped)
  if (!wrapped && config.manager && config.manager !== owner)
    await splitController(
      root,
      signer(owner),
      accounts.getAddress(config.manager),
    )
  const descend = async (
    parent: string,
    node: LegacyName,
    holder: User,
    parentWrapped: boolean,
  ): Promise<{ name: string; wrapped: boolean; holder: User }> => {
    if (!node.subnames?.length)
      return { name: parent, wrapped: parentWrapped, holder }
    if (node.subnames.length !== 1)
      throw new Error(
        'Ownership oracle requires one leaf; do not silently drop siblings',
      )
    const child = node.subnames[0]
    const childHolder = child.owner ?? holder
    const childWrapped = child.type ? child.type === 'wrapped' : parentWrapped
    const args = {
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: child.label,
      ownerAddress: accounts.getAddress(childHolder),
      ownerAccount: signer(childHolder),
      parentOwnerAccount: signer(holder),
    }
    const name = parentWrapped
      ? await makeV1Subname({ ...args, fuses: bitmap(child) })
      : childWrapped
        ? await wrapV1SubnameOfUnwrapped({
            parentLabel: args.parentName,
            childLabel: child.label,
            parentOwnerAccount: signer(holder),
            ownerAccount: signer(childHolder),
          })
        : await makeV1RegistrySubname(args)
    if (parentWrapped && !childWrapped)
      await unwrapChild(
        name,
        signer(childHolder),
        accounts.getAddress(childHolder),
      )
    await setRecords(name, child, childHolder, childWrapped)
    return descend(name, child, childHolder, childWrapped)
  }
  const leaf = await descend(root, config, config.manager ?? owner, wrapped)
  const authority = await publicClient.readContract({
    address: leaf.wrapped ? V1_NAME_WRAPPER : V1_ENS_REGISTRY,
    abi: parseAbi([
      'function owner(bytes32) view returns (address)',
      'function ownerOf(uint256) view returns (address)',
    ]),
    functionName: leaf.wrapped ? 'ownerOf' : 'owner',
    args: [leaf.wrapped ? BigInt(namehash(leaf.name)) : namehash(leaf.name)],
  } as never)
  if (
    String(authority).toLowerCase() !==
    accounts.getAddress(leaf.holder).toLowerCase()
  )
    throw new Error('Legacy leaf authority did not match the original fixture')
  if (config.duration && config.duration < 0) {
    const expiry = await publicClient.readContract({
      address: V1_BASE_REGISTRAR,
      abi: parseAbi(['function nameExpires(uint256) view returns (uint256)']),
      functionName: 'nameExpires',
      args: [BigInt(labelhash(root.split('.')[0]))],
    })
    await testClient.setNextBlockTimestamp({
      timestamp: expiry + BigInt(-config.duration),
    })
    await testClient.mine({ blocks: 1 })
  }
  return { root, ...leaf }
}
