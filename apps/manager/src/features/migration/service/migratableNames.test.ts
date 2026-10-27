import type { PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { makeClassified, OWNER } from './_fixtures'
import { SubnameRecreationError } from './subnameRecreationError'

const mocks = vi.hoisted(() => ({ discoverSubnameRecreation: vi.fn() }))

vi.mock('@/lib/bigname', () => ({ bigname: {} }))
vi.mock('./subnameRecreation', () => ({
  discoverSubnameRecreation: mocks.discoverSubnameRecreation,
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
    const name = makeClassified({ name: 'label.eth', label: 'label' })

    const { eligible, blockedSubnames } = await resolveMigratableNames({
      eligible: [name],
      isSubnameImportEnabled: true,
      owner: OWNER,
      publicClient: {} as PublicClient,
    })

    expect(eligible).toEqual([])
    expect(blockedSubnames).toEqual([{ name, reason }])
  })
})
