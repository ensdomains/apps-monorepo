import { buildConfig } from '@ens-apps/config'
import { getDestinationContracts } from '@ens-apps/smart-account'
import {
  type Address,
  createPublicClient,
  custom,
  getChainContractAddress,
  type Hex,
  labelhash,
  namehash,
  zeroAddress,
  zeroHash,
} from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcSubnameInventory } from './readRpcSubnameInventory'

vi.mock('./readRpcSubnameInventory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./readRpcSubnameInventory')>()),
  readRpcSubnameInventory: vi.fn(),
}))

import {
  RpcSubnameInventoryError,
  readRpcSubnameInventory,
} from './readRpcSubnameInventory'
import {
  readRpcSubnameMigrationImpact,
  readRpcSubnameMigrationImpacts,
} from './readRpcSubnameMigrationImpact'

const chain = buildConfig({ network: 'mainnet' }).chain
const destination = getDestinationContracts(chain.id)
const OWNER: Address = '0x0000000000000000000000000000000000000001'
const GRAVEYARD: Address = '0x000000000000000000000000000000000000dead'
const ROOT = 'parent.eth'
const deferred = () => {
  let resolve = () => {}
  const promise = new Promise<void>((onResolve) => {
    resolve = onResolve
  })
  return { promise, resolve }
}
const snapshot = (): RpcSubnameInventory => ({
  chainId: chain.id,
  registryAddress: getChainContractAddress({
    chain,
    contract: 'ensLegacyRegistry',
  }),
  nameWrapperAddress: getChainContractAddress({
    chain,
    contract: 'ensNameWrapper',
  }),
  checkpoint: { number: 100n, hash: namehash('block'), timestamp: 1000n },
  registries: [],
  roots: [{ node: namehash(ROOT), name: ROOT }],
  rootSources: [
    {
      node: namehash(ROOT),
      name: ROOT,
      registryOwner: OWNER,
      resolver: zeroAddress,
      wrappedData: null,
    },
  ],
  nodes: [],
  scannedParentNodes: [namehash(ROOT)],
  unscannedParentNodes: [],
})
const withRoots = (names: readonly string[]): RpcSubnameInventory => ({
  ...snapshot(),
  roots: names.map((name) => ({ node: namehash(name), name })),
  rootSources: names.map((name) => ({
    node: namehash(name),
    name,
    registryOwner: OWNER,
    resolver: zeroAddress,
    wrappedData: null,
  })),
  scannedParentNodes: names.map((name) => namehash(name)),
})
const readInventory = vi.mocked(readRpcSubnameInventory)
const clientFor = (
  options: {
    readonly latestBlock?: bigint
    readonly canonicalHash?: Hex
    readonly latestOwner?: Address
    readonly implementation?: Address
    readonly rpcChainId?: number
  } = {},
) => {
  const request = vi.fn(
    async () => `0x${(options.rpcChainId ?? chain.id).toString(16)}`,
  )
  const publicClient = createPublicClient({
    chain,
    transport: custom({ request }),
  })
  const getBlock = vi
    .spyOn(publicClient, 'getBlock')
    .mockImplementation(
      async ({ blockNumber }: { readonly blockNumber?: bigint } = {}) => ({
        number: blockNumber ?? options.latestBlock ?? 100n,
        hash: options.canonicalHash ?? namehash('block'),
        timestamp: 1000n,
        baseFeePerGas: 1n,
        blobGasUsed: 0n,
        difficulty: 0n,
        excessBlobGas: 0n,
        extraData: '0x',
        gasLimit: 30_000_000n,
        gasUsed: 0n,
        logsBloom: '0x',
        miner: OWNER,
        mixHash: zeroHash,
        nonce: '0x0000000000000000',
        parentHash: zeroHash,
        receiptsRoot: zeroHash,
        sha3Uncles: zeroHash,
        size: 0n,
        stateRoot: zeroHash,
        totalDifficulty: 0n,
        transactions: [],
        transactionsRoot: zeroHash,
        uncles: [],
        withdrawals: [],
        withdrawalsRoot: zeroHash,
        parentBeaconBlockRoot: zeroHash,
        requestsHash: zeroHash,
        sealFields: [],
      }),
    )
  const readContract = vi
    .spyOn(publicClient, 'readContract')
    .mockImplementation(async ({ functionName, args: inputArgs }) => {
      const args = Array.isArray(inputArgs) ? inputArgs : undefined
      if (functionName === 'GRAVEYARD') return GRAVEYARD
      if (functionName === 'getState')
        return {
          status: 2,
          expiry: 2000n,
          latestOwner: options.latestOwner ?? OWNER,
          tokenId: args?.[0],
          resource: args?.[0],
        }
      if (functionName === 'getWrappedNode') return namehash(ROOT)
      if (functionName === 'verifyContract')
        return options.implementation ?? destination.wrapperRegistryImpl
      throw new Error(`Unexpected read ${functionName}`)
    })
  const multicall = vi
    .spyOn(publicClient, 'multicall')
    .mockImplementation(
      async ({ contracts }: { readonly contracts: readonly unknown[] }) =>
        contracts.map(() => 2000n),
    )
  return { publicClient, getBlock, readContract, multicall }
}

beforeEach(() => {
  vi.clearAllMocks()
  readInventory.mockReset().mockResolvedValue(snapshot())
})

describe('readRpcSubnameMigrationImpact', () => {
  it('queues canonical and head checks while the cached inventory chain check is pending', async () => {
    const client = clientFor()
    const started = deferred()
    const gate = deferred()
    vi.spyOn(client.publicClient, 'request').mockImplementation(async () => {
      started.resolve()
      await gate.promise
      return `0x${chain.id.toString(16)}`
    })
    const pending = readRpcSubnameMigrationImpact({
      ...client,
      migratingNames: [ROOT],
      inventory: snapshot(),
    })
    await started.promise
    try {
      expect(client.getBlock.mock.calls.slice()).toEqual([
        [{ blockNumber: 100n }],
        [],
      ])
      expect(client.readContract).not.toHaveBeenCalled()
    } finally {
      gate.resolve()
      expect((await pending).affectedCount).toBe(0)
    }
  })

  it('queues registrar expiries alongside the graveyard read at the same checkpoint', async () => {
    const client = clientFor()
    const original = client.readContract.getMockImplementation()
    if (!original) throw new Error('Missing contract reader')
    const started = deferred()
    const gate = deferred()
    client.readContract.mockImplementation(async (args) => {
      if (args.functionName === 'GRAVEYARD') {
        started.resolve()
        await gate.promise
      }
      return original(args)
    })
    const pending = readRpcSubnameMigrationImpact({
      ...client,
      migratingNames: [ROOT],
    })
    await started.promise
    try {
      expect(client.multicall).toHaveBeenCalledTimes(1)
      expect(client.multicall.mock.calls[0]?.[0].blockNumber).toBe(100n)
    } finally {
      gate.resolve()
      expect((await pending).affectedCount).toBe(0)
    }
  })

  it('refreshes same-head coverage when selection needs a pruned intermediate ancestor', async () => {
    const intermediate = `independent.${ROOT}`
    const selected = `deep.${intermediate}`
    const prior = withRoots([ROOT, selected])
    const nodes = [
      {
        node: namehash(intermediate),
        name: intermediate,
        parentNode: namehash(ROOT),
        labelhash: labelhash('independent'),
        depth: 1,
        registryOwner: prior.nameWrapperAddress,
        resolver: zeroAddress,
        wrappedData: [OWNER, 65_536, 2000n] as const,
      },
      {
        node: namehash(selected),
        name: selected,
        parentNode: namehash(intermediate),
        labelhash: labelhash('deep'),
        depth: 2,
        registryOwner: OWNER,
        resolver: zeroAddress,
        wrappedData: null,
      },
    ]
    const pruned = {
      ...prior,
      nodes,
      unscannedParentNodes: [namehash(intermediate)],
    }
    const refreshed = {
      ...pruned,
      scannedParentNodes: [...prior.scannedParentNodes, namehash(intermediate)],
      unscannedParentNodes: [],
    }
    readInventory.mockResolvedValue(refreshed)
    await expect(
      readRpcSubnameMigrationImpact({
        ...clientFor(),
        migratingNames: [ROOT, selected],
        inventory: pruned,
      }),
    ).resolves.toMatchObject({ affectedCount: 0 })
    expect(readInventory).toHaveBeenCalledTimes(1)
    expect(readInventory.mock.calls[0]?.[0].roots).toEqual(prior.roots)
    expect(readInventory.mock.calls[0]?.[0].previousInventory).toBeUndefined()
  })

  it('does not require unselected ancestors above the selected root to be scanned', async () => {
    const name = `deep.independent.${ROOT}`
    const inventory = withRoots([name])
    await expect(
      readRpcSubnameMigrationImpact({
        ...clientFor(),
        migratingNames: [name],
        inventory,
      }),
    ).resolves.toMatchObject({ affectedCount: 0 })
    expect(readInventory).not.toHaveBeenCalled()
  })

  it('does not discard a same-height reorg when the requested roots are missing', async () => {
    const client = clientFor()
    const block = await client.getBlock()
    client.getBlock
      .mockResolvedValueOnce(block)
      .mockResolvedValueOnce({ ...block, hash: namehash('reorganized') })
    await expect(
      readRpcSubnameMigrationImpact({
        ...client,
        migratingNames: ['other.eth'],
        inventory: snapshot(),
      }),
    ).rejects.toThrow(/checkpoint changed before/)
    expect(readInventory).not.toHaveBeenCalled()
  })

  it.each(['node-limit', 'history-limit'] as const)(
    'narrows a superset refresh once after a typed %s',
    async (reason) => {
      const selected = 'other.eth'
      const prior = withRoots([ROOT, selected])
      const refreshed = {
        ...withRoots([selected]),
        checkpoint: { ...prior.checkpoint, number: 101n },
      }
      const onInventory = vi.fn()
      readInventory
        .mockRejectedValueOnce(new RpcSubnameInventoryError({ reason }))
        .mockResolvedValueOnce(refreshed)
      await expect(
        readRpcSubnameMigrationImpact({
          ...clientFor({ latestBlock: 101n }),
          migratingNames: [selected],
          inventory: prior,
          onInventory,
        }),
      ).resolves.toMatchObject({ affectedCount: 0 })
      expect(readInventory).toHaveBeenCalledTimes(2)
      expect(readInventory.mock.calls[0]?.[0].previousInventory).toBe(prior)
      expect(readInventory.mock.calls[1]?.[0].roots).toEqual([
        { name: selected, node: namehash(selected) },
      ])
      expect(readInventory.mock.calls[1]?.[0].previousInventory).toBeUndefined()
      expect(readInventory.mock.calls[1]?.[0].knownNames).toEqual([
        selected,
        ROOT,
      ])
      expect(onInventory).toHaveBeenCalledExactlyOnceWith(refreshed)
    },
  )

  it.each([
    ['untyped limit text', new Error('node-limit')],
    ['network failure', new Error('RPC unavailable')],
    [
      'malformed response',
      new RpcSubnameInventoryError({ reason: 'read-failed' }),
    ],
  ] as const)('does not narrow a superset for %s', async (_label, failure) => {
    const prior = withRoots([ROOT, 'other.eth'])
    const onInventory = vi.fn()
    readInventory.mockRejectedValueOnce(failure)
    await expect(
      readRpcSubnameMigrationImpact({
        ...clientFor({ latestBlock: 101n }),
        migratingNames: ['other.eth'],
        inventory: prior,
        onInventory,
      }),
    ).rejects.toBe(failure)
    expect(readInventory).toHaveBeenCalledTimes(1)
    expect(onInventory).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    'does not retry a limit with exact-scope inventory present=%s',
    async (hasInventory) => {
      const failure = new RpcSubnameInventoryError({ reason: 'node-limit' })
      readInventory.mockRejectedValueOnce(failure)
      await expect(
        readRpcSubnameMigrationImpact({
          ...clientFor({ latestBlock: 101n }),
          migratingNames: [ROOT],
          inventory: hasInventory ? snapshot() : undefined,
        }),
      ).rejects.toBe(failure)
      expect(readInventory).toHaveBeenCalledTimes(1)
    },
  )

  it('does not retry again when the requested roots also exceed the cap', async () => {
    const first = new RpcSubnameInventoryError({ reason: 'node-limit' })
    const second = new RpcSubnameInventoryError({ reason: 'history-limit' })
    const onInventory = vi.fn()
    readInventory.mockRejectedValueOnce(first).mockRejectedValueOnce(second)
    await expect(
      readRpcSubnameMigrationImpact({
        ...clientFor({ latestBlock: 101n }),
        migratingNames: ['other.eth'],
        inventory: withRoots([ROOT, 'other.eth']),
        onInventory,
      }),
    ).rejects.toBe(second)
    expect(readInventory).toHaveBeenCalledTimes(2)
    expect(onInventory).not.toHaveBeenCalled()
  })

  it('retains only node-verified cached name hints in a narrowed retry', async () => {
    const selected = 'other.eth'
    const prior = withRoots([ROOT, selected])
    const hint = `known.${ROOT}`
    const inventory = {
      ...prior,
      nodes: [hint, `hidden.${ROOT}`].map((name, index) => ({
        node: namehash(name),
        parentNode: namehash(ROOT),
        labelhash: labelhash(name.split('.')[0] ?? ''),
        name: index === 0 ? name : `incorrect.${ROOT}`,
        depth: 1,
        registryOwner: OWNER,
        resolver: zeroAddress,
        wrappedData: null,
      })),
    }
    readInventory
      .mockRejectedValueOnce(
        new RpcSubnameInventoryError({ reason: 'node-limit' }),
      )
      .mockResolvedValueOnce({
        ...withRoots([selected]),
        checkpoint: { ...prior.checkpoint, number: 101n },
      })
    await readRpcSubnameMigrationImpact({
      ...clientFor({ latestBlock: 101n }),
      migratingNames: [selected],
      inventory,
    })
    expect(readInventory.mock.calls[1]?.[0].knownNames).toEqual([
      selected,
      ROOT,
      hint,
    ])
  })

  it('reads missing roots afresh when a valid candidate-only proof does not cover the selection', async () => {
    const prior = snapshot()
    const name = 'other.eth'
    const node = namehash(name)
    const fresh: RpcSubnameInventory = {
      ...snapshot(),
      roots: [{ node, name }],
      rootSources: snapshot().rootSources.map((source) => ({
        ...source,
        node,
        name,
      })),
      scannedParentNodes: [node],
    }
    readInventory.mockResolvedValue(fresh)
    await expect(
      readRpcSubnameMigrationImpact({
        ...clientFor(),
        migratingNames: [name],
        inventory: prior,
      }),
    ).resolves.toMatchObject({ affectedCount: 0 })
    expect(readInventory).toHaveBeenCalledWith(
      expect.objectContaining({ roots: [{ node, name }] }),
    )
    expect(readInventory.mock.calls[0]?.[0].previousInventory).toBeUndefined()
  })

  it('isolates an uncertain locked subtree from another locked root in one RPC pass', async () => {
    const base = snapshot()
    const roots = ['blocked.eth', 'empty.eth']
    const orphan = namehash('unknown.blocked.eth')
    const inventory: RpcSubnameInventory = {
      ...base,
      roots: roots.map((name) => ({ node: namehash(name), name })),
      rootSources: roots.map((name) => ({
        node: namehash(name),
        name,
        registryOwner: base.nameWrapperAddress,
        resolver: zeroAddress,
        wrappedData: [OWNER, 65_537, 2000n],
      })),
      nodes: [
        {
          node: orphan,
          name: null,
          parentNode: namehash('blocked.eth'),
          labelhash: labelhash('unknown'),
          depth: 1,
          registryOwner: zeroAddress,
          resolver: OWNER,
          wrappedData: null,
        },
      ],
      scannedParentNodes: [...roots.map((name) => namehash(name)), orphan],
    }
    readInventory.mockResolvedValue(inventory)
    const client = clientFor()
    const onInventory = vi.fn()
    const params = { ...client, migratingNames: roots, onInventory }
    expect(await readRpcSubnameMigrationImpacts(params)).toMatchObject([
      {
        name: 'blocked.eth',
        result: {
          status: 'incomplete',
          reason: `Ownership or wrapper state is unknown for ${orphan}.`,
        },
      },
      {
        name: 'empty.eth',
        result: { status: 'complete', impact: { affectedCount: 0 } },
      },
    ])
    expect(readInventory).toHaveBeenCalledTimes(1)
    expect(client.multicall).toHaveBeenCalledTimes(1)
    expect(client.readContract).toHaveBeenCalledTimes(1)
    expect(client.getBlock).toHaveBeenCalledExactlyOnceWith({
      blockNumber: 100n,
    })
    expect(onInventory).not.toHaveBeenCalled()

    await expect(readRpcSubnameMigrationImpact(params)).rejects.toThrow(
      /Ownership or wrapper state is unknown/,
    )
  })

  it('rejects reorganized per-root results before publishing their inventory', async () => {
    const onInventory = vi.fn()
    await expect(
      readRpcSubnameMigrationImpacts({
        ...clientFor({ canonicalHash: namehash('changed') }),
        migratingNames: [ROOT],
        onInventory,
      }),
    ).rejects.toThrow(/checkpoint changed during/)
    expect(onInventory).not.toHaveBeenCalled()
  })

  it('awaits publication when every per-root result is complete', async () => {
    const failure = new Error('Inventory consumer failed')
    await expect(
      readRpcSubnameMigrationImpacts({
        ...clientFor(),
        migratingNames: [ROOT],
        onInventory: async () => {
          await Promise.resolve()
          throw failure
        },
      }),
    ).rejects.toBe(failure)
  })

  it('rejects another RPC network even when the supplied snapshot metadata matches', async () => {
    await expect(
      readRpcSubnameMigrationImpact({
        ...clientFor({ rpcChainId: 11155111 }),
        migratingNames: [ROOT],
        inventory: snapshot(),
      }),
    ).rejects.toThrow(/another chain/)
    expect(readInventory).not.toHaveBeenCalled()
  })

  it('rechecks the pinned checkpoint after the migration proofs', async () => {
    const client = clientFor()
    const onInventory = vi.fn()
    const block = await client.getBlock()
    client.getBlock
      .mockResolvedValueOnce(block)
      .mockResolvedValueOnce(block)
      .mockResolvedValueOnce({ ...block, hash: namehash('reorganized') })
    const params = {
      ...client,
      migratingNames: [ROOT],
      inventory: snapshot(),
      onInventory,
    }
    await expect(readRpcSubnameMigrationImpact(params)).rejects.toThrow(
      /checkpoint changed during/,
    )
    expect(onInventory).not.toHaveBeenCalled()
  })

  it.each([65_536, 65_537])(
    'recognizes a completed child with fuses %s through its certified parent wrapper',
    async (fuses) => {
      const name = `locked.${ROOT}`
      const inventory = snapshot()
      const transferred = {
        ...inventory,
        roots: [{ node: namehash(name), name }],
        rootSources: [
          {
            node: namehash(name),
            name,
            registryOwner: inventory.nameWrapperAddress,
            resolver: zeroAddress,
            wrappedData: [GRAVEYARD, fuses, 2000n] as const,
          },
        ],
        scannedParentNodes: [namehash(name)],
      }
      const client = clientFor()
      expect(
        await readRpcSubnameMigrationImpact({
          ...client,
          migratingNames: [name],
          inventory: transferred,
        }),
      ).toMatchObject({ affectedCount: 0 })
      expect(
        client.readContract.mock.calls.some(
          ([params]) => params.functionName === 'verifyContract',
        ),
      ).toBe(true)
      await expect(
        readRpcSubnameMigrationImpact({
          ...clientFor({ implementation: OWNER }),
          migratingNames: [name],
          inventory: transferred,
        }),
      ).rejects.toThrow(/could not be verified/)
    },
  )

  it('reuses a same-head inventory after checking provenance and canonicality', async () => {
    const client = clientFor()
    expect(
      await readRpcSubnameMigrationImpact({
        ...client,
        migratingNames: [ROOT],
        inventory: snapshot(),
      }),
    ).toMatchObject({ affectedCount: 0 })
    expect(readInventory).not.toHaveBeenCalled()
    expect(client.getBlock).toHaveBeenCalledWith({ blockNumber: 100n })
  })

  it.each([
    { chainId: 11155111 },
    { registryAddress: zeroAddress },
    { nameWrapperAddress: zeroAddress },
    { rootSources: [] },
    { scannedParentNodes: [] },
  ])(
    'rejects a reused inventory with incorrect provenance %j',
    async (overrides) => {
      await expect(
        readRpcSubnameMigrationImpact({
          ...clientFor(),
          migratingNames: [ROOT],
          inventory: { ...snapshot(), ...overrides },
        }),
      ).rejects.toThrow()
      expect(readInventory).not.toHaveBeenCalled()
    },
  )

  it('refreshes inventory when the head advanced instead of authorizing from an old empty graph', async () => {
    const inventory = snapshot()
    const refreshed = {
      ...inventory,
      checkpoint: { ...inventory.checkpoint, number: 101n },
    }
    readInventory.mockResolvedValue(refreshed)
    const onInventory = vi.fn()
    const params = {
      ...clientFor({ latestBlock: 101n }),
      migratingNames: [ROOT],
      inventory,
      onInventory,
    }
    await readRpcSubnameMigrationImpact(params)
    expect(readInventory).toHaveBeenCalledTimes(1)
    expect(readInventory.mock.calls[0]?.[0]).toMatchObject({
      previousInventory: inventory,
    })
    expect(onInventory).toHaveBeenCalledExactlyOnceWith(refreshed)
  })

  it('awaits inventory publication before returning a successful impact', async () => {
    const failure = new Error('Inventory consumer failed')
    const params = {
      ...clientFor(),
      migratingNames: [ROOT],
      inventory: snapshot(),
      onInventory: async () => {
        await Promise.resolve()
        throw failure
      },
    }
    await expect(readRpcSubnameMigrationImpact(params)).rejects.toBe(failure)
  })

  it('does not publish a canonical inventory whose descendant proof is incomplete', async () => {
    const onInventory = vi.fn()
    const params = {
      ...clientFor(),
      migratingNames: [ROOT],
      inventory: {
        ...snapshot(),
        unscannedParentNodes: [namehash(`unknown.${ROOT}`)],
      },
      onInventory,
    }
    await expect(readRpcSubnameMigrationImpact(params)).rejects.toThrow(
      /descendant inventory is incomplete/,
    )
    expect(onInventory).not.toHaveBeenCalled()
  })

  it('rejects an inventory whose pinned block was reorganized', async () => {
    await expect(
      readRpcSubnameMigrationImpact({
        ...clientFor({ canonicalHash: namehash('changed') }),
        migratingNames: [ROOT],
        inventory: snapshot(),
      }),
    ).rejects.toThrow(/checkpoint/i)
  })

  it('does not read already-upgraded proofs for roots outside the requested subset', async () => {
    const inventory = snapshot()
    const client = clientFor()
    await readRpcSubnameMigrationImpact({
      ...client,
      migratingNames: [ROOT],
      inventory: {
        ...inventory,
        rootSources: [
          ...inventory.rootSources,
          {
            ...inventory.rootSources[0],
            node: namehash('other.eth'),
            name: 'other.eth',
            registryOwner: GRAVEYARD,
            resolver: zeroAddress,
            wrappedData: null,
          },
        ],
      },
    })
    expect(
      client.readContract.mock.calls.some(
        ([params]) => params.functionName === 'getState',
      ),
    ).toBe(false)
  })

  it('requires V2 ownership evidence before treating a graveyard root as already upgraded', async () => {
    const inventory = snapshot()
    const transferred = {
      ...inventory,
      rootSources: inventory.rootSources.map((source) => ({
        ...source,
        registryOwner: GRAVEYARD,
      })),
    }
    await expect(
      readRpcSubnameMigrationImpact({
        ...clientFor({ latestOwner: zeroAddress }),
        migratingNames: [ROOT],
        inventory: transferred,
      }),
    ).rejects.toThrow()
    expect(
      await readRpcSubnameMigrationImpact({
        ...clientFor(),
        migratingNames: [ROOT],
        inventory: transferred,
      }),
    ).toMatchObject({ affectedCount: 0 })
  })
})
