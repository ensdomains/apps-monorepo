import { type Address, namehash } from 'viem'
import { describe, expect, it } from 'vitest'
import { makeDomain, OWNER } from './_fixtures'
import { makeRpcSubnameInventory } from './_fixtures/rpcSubnameInventory'
import type { RpcSubnameInventory } from './readRpcSubnameInventory'
import {
  getReusableRpcSubnameInventory,
  getRpcSubnameInventoryCacheKey,
} from './rpcSubnameInventoryCache'

const REGISTRY: Address = '0x000000000000000000000000000000000000abcd'
const WRAPPER: Address = '0x000000000000000000000000000000000000defa'
const source = {
  chainId: 1,
  registryAddress: REGISTRY,
  nameWrapperAddress: WRAPPER,
}
const inventory: RpcSubnameInventory = {
  ...makeRpcSubnameInventory({
    rootNames: ['alice.eth', 'bob.eth'],
    domains: ['alice.eth', 'bob.eth', 'child.alice.eth'].map((name) =>
      makeDomain({ name }),
    ),
  }),
  ...source,
}
const run = (
  overrides: Partial<Parameters<typeof getReusableRpcSubnameInventory>[0]> = {},
) =>
  getReusableRpcSubnameInventory({
    inventory,
    ...source,
    names: ['alice.eth'],
    ...overrides,
  })

describe('RPC subname inventory cache', () => {
  it('reuses the complete inventory for a root subset without trimming its identity', () => {
    expect(run()).toBe(inventory)
    expect(run({ names: ['bob.eth', 'alice.eth'] })).toBe(inventory)
  })

  it('matches the same name and contract addresses regardless of casing', () => {
    expect(
      run({
        names: ['ALICE.eth'],
        registryAddress: '0x000000000000000000000000000000000000ABCD',
        nameWrapperAddress: '0x000000000000000000000000000000000000DEFA',
      }),
    ).toBe(inventory)
  })

  it.each([
    ['absent inventory', { inventory: undefined }],
    ['different chain', { chainId: 11155111 }],
    ['different registry', { registryAddress: OWNER }],
    ['different wrapper', { nameWrapperAddress: OWNER }],
    ['new root', { names: ['new.eth'] }],
    ['descendant without root provenance', { names: ['child.alice.eth'] }],
    ['missing root source', { inventory: { ...inventory, rootSources: [] } }],
    [
      'unscanned requested root',
      {
        inventory: {
          ...inventory,
          scannedParentNodes: [namehash('bob.eth')],
        },
      },
    ],
  ] as const)('rejects %s', (_description, overrides) => {
    expect(run(overrides)).toBeUndefined()
  })

  it('keeps checkpoint age decisions with the RPC reader', () => {
    const earlier = {
      ...inventory,
      checkpoint: { ...inventory.checkpoint, number: 1n, timestamp: 1n },
    }
    expect(run({ inventory: earlier })).toBe(earlier)
  })

  it('normalizes owner and source contracts in the wallet cache key', () => {
    expect(
      getRpcSubnameInventoryCacheKey({
        ownerAddress: '0x000000000000000000000000000000000000FEED',
        chainId: 1,
        registryAddress: '0x000000000000000000000000000000000000ABCD',
        nameWrapperAddress: '0x000000000000000000000000000000000000DEFA',
      }),
    ).toEqual(
      getRpcSubnameInventoryCacheKey({
        ownerAddress: '0x000000000000000000000000000000000000feed',
        ...source,
      }),
    )
  })

  it.each([
    { ownerAddress: REGISTRY },
    { chainId: 11155111 },
    { registryAddress: OWNER },
    { nameWrapperAddress: OWNER },
  ])('isolates different wallet or source identities: %j', (overrides) => {
    const scope = { ownerAddress: OWNER, ...source }
    expect(
      getRpcSubnameInventoryCacheKey({ ...scope, ...overrides }),
    ).not.toEqual(getRpcSubnameInventoryCacheKey(scope))
  })
})
