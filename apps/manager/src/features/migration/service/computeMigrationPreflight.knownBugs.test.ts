import type { Config as WagmiConfig } from '@wagmi/core'
import { namehash, type PublicClient, zeroAddress } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { OWNER as EOA, makeDomain } from './_fixtures'
import { FUSES } from './classifyNames'
import { computeMigrationPreflight } from './computeMigrationPreflight'

const alice = makeDomain({ id: namehash('alice.eth') })
// The parent bob.eth is neither owned here nor migrated, so it has no wrapper.
const orphanLockedChild = makeDomain({
  id: namehash('sub.bob.eth'),
  name: 'sub.bob.eth',
  labelName: 'sub',
  parentName: 'bob.eth',
  parentFuses: FUSES.CANNOT_UNWRAP,
  registrantId: null,
  resolverAddress: null,
  isWrapped: true,
  fuses: FUSES.CANNOT_UNWRAP | FUSES.PARENT_CANNOT_CONTROL,
})

describe('computeMigrationPreflight known bugs (WEB-1942)', () => {
  // The orphan locked child is classified eligible, its route throws missing-wrapper, and Promise.all rejects the whole preflight. Remove .fails when fixed.
  it.fails('WEB-1942 #3: keeps an unrelated name plannable when a selected locked child has no migrated parent', async () => {
    const publicClient = {
      readContract: vi.fn(async () => zeroAddress),
    } as unknown as PublicClient

    const result = await computeMigrationPreflight({
      eoa: EOA,
      domains: [alice, orphanLockedChild],
      wagmiConfig: {} as WagmiConfig,
      publicClient,
    })

    expect([...(result.directMigrationRoutes?.keys() ?? [])]).toContain(
      'alice.eth',
    )
  })
})
