import {
  createPublicClient,
  http,
  namehash,
  type PublicClient,
  zeroAddress,
  zeroHash,
} from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { envConfig } from '@/config'
import { V2_CONTRACTS } from '../contracts/addresses'
import { makeClassified, makeDomain, OWNER } from './_fixtures'
import { makeRpcSubnameInventory } from './_fixtures/rpcSubnameInventory'
import { computeExpectedWrapperRegistry } from './directMigrationRoutes'
import { RpcSubnameInventoryError } from './readRpcSubnameInventory'
import { SubnameRecreationError } from './subnameRecreationError'

const mocks = vi.hoisted(() => ({
  discoverSubnameRecreation: vi.fn(),
  getSubnameMigrationImpact: vi.fn(),
  readRpcSubnameInventory: vi.fn(),
}))

vi.mock('@/lib/bigname', () => ({ bigname: {} }))
vi.mock('./readRpcSubnameInventory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./readRpcSubnameInventory')>()),
  readRpcSubnameInventory: mocks.readRpcSubnameInventory,
}))
vi.mock('./readRpcSubnameMigrationImpact', () => ({
  readRpcSubnameMigrationImpacts: mocks.getSubnameMigrationImpact,
}))
vi.mock('./subnameRecreation', () => ({
  discoverSubnameRecreation: mocks.discoverSubnameRecreation,
  applySubnameRecreation: ({ classified }: { classified: unknown[] }) =>
    classified,
}))

import { resolveMigratableNames } from './migratableNames'

describe('resolveMigratableNames', () => {
  it('partitions a resource-limited root batch without blocking individually supported trees', async () => {
    const names = ['alice.eth', 'bob.eth'].map((name) =>
      makeClassified({ name, id: namehash(name) }),
    )
    mocks.readRpcSubnameInventory.mockRejectedValueOnce(
      new RpcSubnameInventoryError({
        reason: 'node-limit',
        cause: new Error('Budget exceeded'),
      }),
    )
    const result = await resolveMigratableNames({
      eligible: names,
      owner: OWNER,
      isSubnameImportEnabled: true,
      publicClient: createPublicClient({
        chain: envConfig.chain,
        transport: http(),
      }),
    })
    expect(result.eligible).toEqual(names)
    expect(result.blockedSubnames).toEqual([])
    expect(
      mocks.readRpcSubnameInventory.mock.calls.map(
        ([params]) => params.roots.length,
      ),
    ).toEqual([2, 1, 1])
  })

  it('discards an unrelated cached superset after a resource limit and checks only the selected root', async () => {
    const names = ['alice.eth', 'bob.eth'].map((name) =>
      makeClassified({ name, id: namehash(name) }),
    )
    const selected = names.slice(1)
    const previousInventory = makeRpcSubnameInventory({
      domains: names.map(({ domain }) =>
        makeDomain({ name: domain.name, id: domain.id }),
      ),
      rootNames: names.map(({ domain }) => domain.name),
    })
    mocks.readRpcSubnameInventory.mockRejectedValueOnce(
      new RpcSubnameInventoryError({
        reason: 'history-limit',
        cause: new Error('Budget exceeded'),
      }),
    )
    const result = await resolveMigratableNames({
      eligible: selected,
      previousInventory,
      owner: OWNER,
      isSubnameImportEnabled: true,
      publicClient: createPublicClient({
        chain: envConfig.chain,
        transport: http(),
      }),
    })
    expect(result.eligible).toEqual(selected)
    expect(
      mocks.readRpcSubnameInventory.mock.calls.map(
        ([params]) => params.roots.length,
      ),
    ).toEqual([2, 1])
  })

  it.each(['node-limit', 'read-failed'] as const)(
    'does not repeatedly retry a single root after %s',
    async (reason) => {
      const name = makeClassified({
        name: 'alice.eth',
        id: namehash('alice.eth'),
      })
      mocks.readRpcSubnameInventory.mockRejectedValueOnce(
        new RpcSubnameInventoryError({
          reason,
          cause: new Error('Inventory failed'),
        }),
      )
      const result = await resolveMigratableNames({
        eligible: [name],
        owner: OWNER,
        isSubnameImportEnabled: true,
        publicClient: createPublicClient({
          chain: envConfig.chain,
          transport: http(),
        }),
      })
      expect(result.blockedSubnames).toEqual([
        {
          name,
          reason: reason === 'node-limit' ? 'too-large' : 'unverified-source',
        },
      ])
      expect(mocks.readRpcSubnameInventory).toHaveBeenCalledTimes(1)
    },
  )

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readRpcSubnameInventory.mockImplementation(
      async ({
        roots,
      }: {
        roots: readonly { node: string; name: string }[]
      }) => ({
        roots,
        rootSources: [],
        nodes: [],
        unscannedParentNodes: [],
        checkpoint: { number: 1n, hash: zeroHash, timestamp: 1000n },
      }),
    )
    mocks.getSubnameMigrationImpact.mockImplementation(
      async ({ migratingNames }: { migratingNames: readonly string[] }) =>
        migratingNames.map((name) => ({
          name,
          result: {
            status: 'complete',
            impact: { affectedCount: 0, parents: [] },
          },
        })),
    )
  })

  it('checks a selection with one RPC inventory and no per-parent indexed counts', async () => {
    const names = ['alice.eth', 'bob.eth', 'carol.eth'].map((name) =>
      makeClassified({ name, id: namehash(name) }),
    )
    const result = await resolveMigratableNames({
      eligible: names,
      owner: OWNER,
      isSubnameImportEnabled: true,
      publicClient: createPublicClient({
        chain: envConfig.chain,
        transport: http(),
      }),
    })
    expect(result.eligible).toEqual(names)
    expect(result.blockedSubnames).toEqual([])
    expect(mocks.readRpcSubnameInventory).toHaveBeenCalledTimes(1)
    expect(
      mocks.readRpcSubnameInventory.mock.calls[0]?.[0].roots.map(
        ({ name }: { name: string }) => name,
      ),
    ).toEqual(names.map(({ domain }) => domain.name))
    expect(mocks.discoverSubnameRecreation).not.toHaveBeenCalled()
  })

  it('keeps an unrelated empty root eligible when another root has unverifiable descendants', async () => {
    const bad = makeClassified({
      name: 'bad.eth',
      id: namehash('bad.eth'),
      tokenType: 'locked-2ld',
    })
    const good = makeClassified({
      name: 'good.eth',
      id: namehash('good.eth'),
      tokenType: 'locked-2ld',
    })
    mocks.getSubnameMigrationImpact.mockResolvedValueOnce([
      {
        name: 'bad.eth',
        result: {
          status: 'incomplete',
          reason: 'Ownership is unknown for its resolver-bearing child.',
        },
      },
      {
        name: 'good.eth',
        result: {
          status: 'complete',
          impact: { affectedCount: 0, parents: [] },
        },
      },
    ])
    const result = await resolveMigratableNames({
      eligible: [bad, good],
      owner: OWNER,
      isSubnameImportEnabled: true,
      publicClient: createPublicClient({
        chain: envConfig.chain,
        transport: http(),
      }),
    })
    expect(result.eligible).toEqual([good])
    expect(result.blockedSubnames).toEqual([
      { name: bad, reason: 'unverified-source' },
    ])
    expect(mocks.readRpcSubnameInventory).toHaveBeenCalledTimes(1)
    expect(mocks.getSubnameMigrationImpact).toHaveBeenCalledTimes(1)
  })

  // The error message embeds the name, so only the fixed reason may decide.
  it.each([
    ['the indexed child inventory could not be read.', 'incomplete-inventory'],
    [
      'an exact, valid subname label is required before migration.',
      'unknown-label',
    ],
  ] as const)('classifies "%s" for label.eth as %s', async (detail, reason) => {
    mocks.readRpcSubnameInventory.mockResolvedValueOnce({
      roots: [{ node: namehash('label.eth'), name: 'label.eth' }],
      nodes: [
        {
          parentNode: namehash('label.eth'),
          node: namehash('child.label.eth'),
        },
      ],
    })
    mocks.discoverSubnameRecreation.mockRejectedValueOnce(
      new SubnameRecreationError({
        ensName: 'label.eth',
        detail,
        message: `Cannot import subnames of "label.eth": ${detail}`,
      }),
    )
    const name = makeClassified({
      name: 'label.eth',
      id: namehash('label.eth'),
      label: 'label',
    })
    const unrelated = makeClassified({
      name: 'unrelated.eth',
      id: namehash('unrelated.eth'),
    })
    const externalChild = makeClassified({
      name: 'sub.external.eth',
      id: namehash('sub.external.eth'),
      tokenType: 'locked-child',
      parentName: 'external.eth',
    })
    const externalDescendant = makeClassified({
      name: 'leaf.sub.external.eth',
      id: namehash('leaf.sub.external.eth'),
      tokenType: 'detached-child',
      parentName: externalChild.domain.name,
    })
    const parent = makeClassified({
      name: 'parent.eth',
      id: namehash('parent.eth'),
      tokenType: 'locked-2ld',
    })
    const child = makeClassified({
      name: 'sub.parent.eth',
      id: namehash('sub.parent.eth'),
      tokenType: 'locked-child',
      parentName: parent.domain.name,
    })
    const invalidChild = makeClassified({
      name: 'sub.parent.xyz',
      id: namehash('sub.parent.xyz'),
      tokenType: 'locked-child',
      parentName: 'parent.xyz',
    })
    const unsupportedParent = makeClassified({
      name: 'unsupported.eth',
      id: namehash('unsupported.eth'),
      label: 'unsupported',
    })
    const unsupportedChild = makeClassified({
      name: 'sub.unsupported.eth',
      id: namehash('sub.unsupported.eth'),
      tokenType: 'locked-child',
      parentName: unsupportedParent.domain.name,
    })
    const unreadableChild = makeClassified({
      name: 'sub.rpc-failure.eth',
      id: namehash('sub.rpc-failure.eth'),
      tokenType: 'locked-child',
      parentName: 'rpc-failure.eth',
    })
    mocks.getSubnameMigrationImpact.mockImplementation(
      async ({ migratingNames }: { migratingNames: readonly string[] }) =>
        migratingNames.map((name) => ({
          name,
          result: {
            status: 'complete',
            impact: { affectedCount: 0, parents: [] },
          },
        })),
    )
    let parentReads = 0
    const publicClient = {
      getCode: vi.fn(async () => '0x01'),
      readContract: vi.fn(
        async ({
          functionName,
          args,
        }: {
          functionName: string
          args?: readonly unknown[]
        }) => {
          if (functionName === 'getSubregistry') {
            if (args?.[0] === 'rpc-failure') throw new Error('RPC unavailable')
            return parentReads++ === 0
              ? zeroAddress
              : computeExpectedWrapperRegistry({ name: 'external.eth' })
          }
          if (functionName === 'verifyContract')
            return V2_CONTRACTS.WrapperRegistryImpl
          if (functionName === 'getWrappedNode') return namehash('external.eth')
          return { expiry: 4_102_444_800n, latestOwner: OWNER }
        },
      ),
    } as unknown as PublicClient

    const { eligible, blockedSubnames } = await resolveMigratableNames({
      eligible: [
        name,
        unrelated,
        externalChild,
        externalDescendant,
        parent,
        child,
        invalidChild,
        unsupportedParent,
        unsupportedChild,
        unreadableChild,
      ],
      isSubnameImportEnabled: true,
      owner: OWNER,
      publicClient,
    })

    expect(eligible).toEqual([unrelated, parent, child, unsupportedParent])
    expect(blockedSubnames).toHaveLength(6)
    expect(blockedSubnames).toEqual(
      expect.arrayContaining([
        { name, reason },
        {
          name: externalChild,
          reason: 'parent-not-upgraded',
          parentName: 'external.eth',
        },
        {
          name: externalDescendant,
          reason: 'parent-not-upgraded',
          parentName: 'external.eth',
        },
        { name: invalidChild, reason: 'unsupported-route' },
        { name: unsupportedChild, reason: 'unsupported-route' },
        { name: unreadableChild, reason: 'unverified-source' },
      ]),
    )
  })
})
