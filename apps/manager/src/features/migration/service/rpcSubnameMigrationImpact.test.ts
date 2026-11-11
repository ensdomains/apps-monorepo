import { namehash, zeroAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { OTHER, OWNER } from './_fixtures'
import { makeRpcSubnameInventory } from './_fixtures/rpcSubnameInventory'
import type {
  RpcSubnameNode,
  RpcSubnameSource,
} from './readRpcSubnameInventory'
import {
  computeRpcSubnameMigrationImpact,
  getRpcMigrationScanPolicy,
} from './rpcSubnameMigrationImpact'

const WRAPPER = '0x0000000000000000000000000000000000000008'
const REGISTRY = '0x0000000000000000000000000000000000000009'
const root = 'parent.eth'
const source = (name: string): RpcSubnameSource => ({
  name,
  node: namehash(name),
  registryOwner: OWNER,
  resolver: zeroAddress,
  wrappedData: null,
})
const child = (
  name: string,
  overrides: Partial<RpcSubnameNode> = {},
): RpcSubnameNode => ({
  ...source(name),
  parentNode: namehash(name.slice(name.indexOf('.') + 1)),
  labelhash: namehash(name),
  depth: name.split('.').length - 2,
  ...overrides,
})
const run = (
  nodes: readonly RpcSubnameNode[],
  overrides: Partial<
    Parameters<typeof computeRpcSubnameMigrationImpact>[0]
  > = {},
) =>
  computeRpcSubnameMigrationImpact({
    migratingNames: [root],
    copiedNames: [],
    renewingNames: [],
    inventory: {
      chainId: 1,
      registryAddress: REGISTRY,
      nameWrapperAddress: WRAPPER,
      checkpoint: { number: 100n, hash: namehash('block'), timestamp: 1000n },
      registries: [],
      roots: [{ node: namehash(root), name: root }],
      rootSources: [source(root)],
      nodes,
      scannedParentNodes: [namehash(root), ...nodes.map(({ node }) => node)],
      unscannedParentNodes: [],
    },
    nameWrapperAddress: WRAPPER,
    upgradedNodes: new Set(),
    expiredRootNodes: new Set(),
    checkedAt: 1000,
    ...overrides,
  })

describe('RPC subname migration impact', () => {
  it('ignores an unrelated incomplete frontier while checking a proven empty root', () => {
    const other = source('other.eth')
    const inventory = makeRpcSubnameInventory({ domains: [], rootNames: [] })
    expect(
      run([], {
        inventory: {
          ...inventory,
          roots: [
            { node: namehash(root), name: root },
            { node: other.node, name: other.name ?? undefined },
          ],
          rootSources: [source(root), other],
          scannedParentNodes: [namehash(root)],
          unscannedParentNodes: [other.node],
        },
      }),
    ).toMatchObject({ status: 'complete', impact: { affectedCount: 0 } })
  })

  it.each([65_536, 0])(
    'requires descendant scans only for branches affected by migration: fuses %s',
    (fuses) => {
      const independent = child(`branch.${root}`, {
        registryOwner: WRAPPER,
        wrappedData: [OTHER, fuses, 2000n],
      })
      const inventory = makeRpcSubnameInventory({ domains: [], rootNames: [] })
      expect(
        run([independent], {
          inventory: {
            ...inventory,
            roots: [{ node: namehash(root), name: root }],
            rootSources: [source(root)],
            nodes: [independent],
            scannedParentNodes: [namehash(root)],
            unscannedParentNodes: [independent.node],
          },
        }),
      ).toMatchObject(
        fuses === 65_536
          ? { status: 'complete', impact: { affectedCount: 0 } }
          : { status: 'incomplete' },
      )
    },
  )

  it('scans independent branches only when they contain a selected migration', () => {
    const independent = child(`branch.${root}`, {
      registryOwner: WRAPPER,
      wrappedData: [OTHER, 65_536, 2000n],
    })
    const checkpoint = {
      number: 100n,
      hash: namehash('block'),
      timestamp: 1000n,
    }
    const ordinary = getRpcMigrationScanPolicy({
      migratingNames: [root],
      nameWrapperAddress: WRAPPER,
    })
    const selected = getRpcMigrationScanPolicy({
      migratingNames: [root, `leaf.branch.${root}`],
      nameWrapperAddress: WRAPPER,
    })
    expect(ordinary(independent, checkpoint)).toBe(false)
    expect(selected(independent, checkpoint)).toBe(true)
    expect(ordinary(child(`dependent.${root}`), checkpoint)).toBe(true)
    expect(
      ordinary(
        child(`unknown.${root}`, {
          registryOwner: zeroAddress,
          resolver: OTHER,
        }),
        checkpoint,
      ),
    ).toBe(true)
  })

  it('recognizes expired emancipated children whose getter clears owner and fuses', () => {
    expect(
      run([
        child(`expired.${root}`, {
          registryOwner: WRAPPER,
          resolver: OTHER,
          wrappedData: [zeroAddress, 0, 999n],
        }),
      ]),
    ).toMatchObject({ status: 'complete', impact: { affectedCount: 0 } })
  })

  it.each([0n, 1000n, 1001n])(
    'keeps an unverifiable wrapper holder blocked at expiry %s',
    (expiry) => {
      expect(
        run([
          child(`unknown.${root}`, {
            registryOwner: WRAPPER,
            wrappedData: [zeroAddress, 0, expiry],
          }),
        ]),
      ).toMatchObject({ status: 'incomplete' })
    },
  )

  it('skips only fully scanned ownerless leaves without serving resources', () => {
    const tombstone = child(`deleted.${root}`, {
      registryOwner: zeroAddress,
      resolver: zeroAddress,
    })
    expect(run([tombstone])).toMatchObject({
      status: 'complete',
      impact: { affectedCount: 0 },
    })
    expect(run([tombstone, child(`nested.deleted.${root}`)])).toMatchObject({
      status: 'incomplete',
    })
    expect(
      run([tombstone], {
        inventory: {
          chainId: 1,
          registryAddress: REGISTRY,
          nameWrapperAddress: WRAPPER,
          checkpoint: {
            number: 100n,
            hash: namehash('block'),
            timestamp: 1000n,
          },
          registries: [],
          roots: [{ node: namehash(root), name: root }],
          rootSources: [source(root)],
          nodes: [tombstone],
          scannedParentNodes: [namehash(root)],
          unscannedParentNodes: [],
        },
      }),
    ).toMatchObject({ status: 'incomplete' })
  })

  it('skips a deleted subname once everything below it is deleted too', () => {
    const deleted = { registryOwner: zeroAddress, resolver: zeroAddress }
    expect(
      run([
        child(`design.${root}`, deleted),
        child(`shop.design.${root}`, deleted),
        child(`leaf.shop.design.${root}`, deleted),
      ]),
    ).toMatchObject({ status: 'complete', impact: { affectedCount: 0 } })
  })

  it('permits an expired .eth root only when the plan renews it', () => {
    const expiredRootNodes = new Set([namehash(root)])
    expect(run([], { expiredRootNodes })).toMatchObject({
      status: 'incomplete',
    })
    expect(run([], { expiredRootNodes, renewingNames: [root] })).toMatchObject({
      status: 'complete',
      impact: { affectedCount: 0 },
    })
  })

  it('does not let a renewal flag revive an expired selected subname', () => {
    const selected = `expired.${root}`
    const expired = child(selected, {
      registryOwner: WRAPPER,
      wrappedData: [OWNER, 65_536, 999n],
    })
    expect(
      run([expired], { migratingNames: [selected], renewingNames: [selected] }),
    ).toMatchObject({ status: 'incomplete' })
  })

  it('finds a selected descendant below an unselected independent branch', () => {
    const independent = `independent.${root}`
    const selected = `nested.${independent}`
    expect(
      run(
        [
          child(independent, {
            registryOwner: WRAPPER,
            wrappedData: [OTHER, 65_536, 2000n],
          }),
          child(selected),
          child(`leaf.${selected}`),
        ],
        { migratingNames: [root, selected] },
      ),
    ).toMatchObject({
      status: 'complete',
      impact: { parents: [{ name: selected, affectedCount: 1 }] },
    })
  })

  it('counts an omitted same-wallet child by its hash even without its label', () => {
    const result = run([child(`unknown.${root}`, { name: null })])
    expect(result).toMatchObject({
      status: 'complete',
      impact: { affectedCount: 1, parents: [{ name: root, affectedCount: 1 }] },
    })
  })

  it('preserves only copied branches whose ancestors are preserved', () => {
    const copied = `copied.${root}`
    const omitted = `omitted.${root}`
    const nodes = [child(copied), child(omitted), child(`leaf.${omitted}`)]
    expect(
      run(nodes, { copiedNames: [copied, `leaf.${omitted}`] }),
    ).toMatchObject({
      status: 'complete',
      impact: { affectedCount: 2 },
    })
  })

  it.each([
    { fuses: 65_536, expiry: 2000n, expected: 0 },
    { fuses: 65_536, expiry: 999n, expected: 0 },
    { fuses: 0, expiry: 999n, expected: 1 },
  ])(
    'applies wrapper independence and expiry: $fuses / $expiry',
    ({ fuses, expiry, expected }) => {
      expect(
        run([
          child(`wrapped.${root}`, {
            registryOwner: WRAPPER,
            wrappedData: [OTHER, fuses, expiry],
          }),
        ]),
      ).toMatchObject({
        status: 'complete',
        impact: { affectedCount: expected },
      })
    },
  )

  it('starts a new impact boundary at a selected independent child', () => {
    const selected = `wrapped.${root}`
    expect(
      run(
        [
          child(selected, {
            registryOwner: WRAPPER,
            wrappedData: [OTHER, 65_536, 2000n],
          }),
          child(`leaf.${selected}`),
        ],
        { migratingNames: [root, selected] },
      ),
    ).toMatchObject({
      status: 'complete',
      impact: {
        parents: [{ name: selected, affectedCount: 1 }],
        affectedCount: 1,
      },
    })
  })

  it('checks remaining selected descendants of an already-upgraded parent', () => {
    const selected = `wrapped.${root}`
    expect(
      run([child(selected), child(`leaf.${selected}`)], {
        migratingNames: [root, selected],
        upgradedNodes: new Set([namehash(root)]),
      }),
    ).toMatchObject({
      status: 'complete',
      impact: { parents: [{ name: selected, affectedCount: 1 }] },
    })
  })

  it('fails closed for an ownerless node with a serving resolver', () => {
    expect(
      run([
        child(`ownerless.${root}`, {
          registryOwner: zeroAddress,
          resolver: OTHER,
        }),
      ]),
    ).toMatchObject({ status: 'incomplete' })
  })

  describe('unknown-label subnames', () => {
    const unknown = (index: number) =>
      `[${index.toString(16).padStart(64, '0')}].${root}`
    const unlabelled = (name: string) => child(name, { name: null })

    it('leaves an unknown-label leaf behind instead of blocking, beside a copied child', () => {
      const result = run([unlabelled(unknown(1)), child(`blog.${root}`)], {
        copiedNames: [`blog.${root}`],
        unknownLabelNames: [unknown(1)],
      })
      expect(result).toMatchObject({
        status: 'complete',
        impact: { affectedCount: 0, unrecoverable: [unknown(1)] },
      })
    })

    it('still blocks on an unknown-label subname that has a subname', () => {
      const result = run(
        [unlabelled(unknown(1)), child(`deep.${unknown(1)}`)],
        { unknownLabelNames: [unknown(1)] },
      )
      expect(result).toMatchObject({
        status: 'complete',
        impact: { affectedCount: 2, unrecoverable: [] },
      })
    })

    it.each([
      { count: 5, affectedCount: 0, dropped: 5 },
      { count: 6, affectedCount: 6, dropped: 0 },
    ])(
      'with $count under one parent loses $affectedCount',
      ({ count, affectedCount, dropped }) => {
        const names = Array.from({ length: count }, (_, index) =>
          unknown(index),
        )
        const result = run(names.map(unlabelled), { unknownLabelNames: names })
        expect(result).toMatchObject({
          status: 'complete',
          impact: { affectedCount },
        })
        expect(
          result.status === 'complete' && result.impact.unrecoverable,
        ).toHaveLength(dropped)
      },
    )

    it('changes the fingerprint with the names left behind', () => {
      const fingerprint = (names: readonly string[]) => {
        const result = run(names.map(unlabelled), { unknownLabelNames: names })
        return result.status === 'complete' && result.impact.fingerprint
      }
      expect(fingerprint([unknown(1)])).not.toBe(
        fingerprint([unknown(1), unknown(2)]),
      )
    })
  })

  it('fails closed when the graph frontier has not been scanned', () => {
    const base = run([])
    expect(base).toMatchObject({
      status: 'complete',
      impact: { affectedCount: 0 },
    })
    expect(
      run([], {
        inventory: {
          chainId: 1,
          registryAddress: REGISTRY,
          nameWrapperAddress: WRAPPER,
          checkpoint: {
            number: 100n,
            hash: namehash('block'),
            timestamp: 1000n,
          },
          registries: [],
          roots: [{ node: namehash(root), name: root }],
          rootSources: [source(root)],
          nodes: [],
          scannedParentNodes: [],
          unscannedParentNodes: [namehash(root)],
        },
      }),
    ).toMatchObject({ status: 'incomplete' })
  })
})
