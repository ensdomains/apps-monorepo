import { ok } from 'neverthrow'
import { namehash, type PublicClient, zeroAddress } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { V2_CONTRACTS } from '../contracts/addresses'
import { makeClassified, OWNER } from './_fixtures'
import { computeExpectedWrapperRegistry } from './directMigrationRoutes'
import { SubnameRecreationError } from './subnameRecreationError'

const mocks = vi.hoisted(() => ({
  discoverSubnameRecreation: vi.fn(),
  getSubnameMigrationImpact: vi.fn(),
}))

vi.mock('@/lib/bigname', () => ({ bigname: {} }))
vi.mock('@ens-apps/migration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ens-apps/migration')>()),
  getSubnameMigrationImpact: mocks.getSubnameMigrationImpact,
}))
vi.mock('./subnameRecreation', () => ({
  discoverSubnameRecreation: mocks.discoverSubnameRecreation,
  applySubnameRecreation: ({ classified }: { classified: unknown[] }) =>
    classified,
}))

import { resolveMigratableNames } from './migratableNames'

describe('resolveMigratableNames', () => {
  // The error message embeds the name, so only the fixed reason may decide.
  it.each([
    ['the indexed child inventory could not be read.', 'incomplete-inventory'],
    [
      'an exact, valid subname label is required before migration.',
      'unknown-label',
    ],
  ] as const)('classifies "%s" for label.eth as %s', async (detail, reason) => {
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
    mocks.getSubnameMigrationImpact.mockResolvedValue(ok({ affectedCount: 0 }))
    let parentReads = 0
    const publicClient = {
      getCode: vi.fn(async () => '0x01'),
      readContract: vi.fn(
        async ({ functionName }: { functionName: string }) => {
          if (functionName === 'getSubregistry') {
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
      ],
      isSubnameImportEnabled: true,
      owner: OWNER,
      publicClient,
    })

    expect(eligible).toEqual([unrelated, parent, child])
    expect(blockedSubnames).toEqual([
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
    ])
  })
})
