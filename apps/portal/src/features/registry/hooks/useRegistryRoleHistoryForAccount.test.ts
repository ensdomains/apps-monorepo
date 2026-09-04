import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { type Address, getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: { request: mocks.request },
}))

import {
  getRegistryRoleHistoryForAccount,
  MAX_PAGES,
} from './useRegistryRoleHistoryForAccount'

const REGISTRY = '0x1111111111111111111111111111111111111111' as Address
const ACCOUNT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const OTHER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const ROOT = '0x0'
const NAME_RESOURCE =
  '0x9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658'
const RENEW = `0x${registryRoles.ROLE_RENEW.toString(16)}`

const event = (
  block: number,
  account: Address,
  resource = ROOT,
  newRoleBitmap = RENEW,
) => ({
  type: 'EACRolesChanged',
  data: JSON.stringify({
    resource,
    account,
    oldRoleBitmap: '0x0',
    newRoleBitmap,
  }),
  transactionHash: `0x${block.toString(16).padStart(64, '0')}`,
  timestamp: block * 12,
  blockNumber: block,
})

type Node = ReturnType<typeof event>

const page = (
  nodes: Node[],
  endCursor: string | null,
  hasNextPage: boolean,
) => ({
  eventConnection: {
    pageInfo: { hasNextPage, endCursor },
    edges: nodes.map((node) => ({ node })),
  },
})

const run = () =>
  getRegistryRoleHistoryForAccount({
    registryAddress: REGISTRY,
    account: ACCOUNT,
  })

describe('getRegistryRoleHistoryForAccount', () => {
  beforeEach(() => {
    mocks.request.mockReset()
  })

  it('is complete when the feed fits one page', async () => {
    mocks.request.mockResolvedValueOnce(
      page([event(10, ACCOUNT), event(9, OTHER)], 'c1', false),
    )

    const result = (await run())._unsafeUnwrap()

    expect(result.isComplete).toBe(true)
    expect(result.entries.map((e) => e.blockNumber)).toEqual([10])
    expect(mocks.request).toHaveBeenCalledOnce()
  })

  it('advances the cursor and is complete once the connection is exhausted', async () => {
    mocks.request
      .mockResolvedValueOnce(page([event(20, ACCOUNT)], 'c1', true))
      .mockResolvedValueOnce(page([event(5, ACCOUNT)], 'c2', false))

    const result = (await run())._unsafeUnwrap()

    expect(result.isComplete).toBe(true)
    expect(result.entries.map((e) => e.blockNumber)).toEqual([20, 5])
    // The second request must carry the first page's end cursor.
    expect(mocks.request.mock.calls[1]?.[1]).toMatchObject({ after: 'c1' })
    expect(mocks.request.mock.calls[0]?.[1]).toMatchObject({ after: undefined })
  })

  it('stops at the page cap and reports the scan as incomplete', async () => {
    // A registry the scan cannot exhaust. This is the case that used to render
    // as "No role changes yet": the account's grants sit beyond the window.
    mocks.request.mockImplementation(async (_q, vars: { after?: string }) =>
      page([event(1000, OTHER)], `${vars.after ?? 'c'}+`, true),
    )

    const result = (await run())._unsafeUnwrap()

    expect(result.isComplete).toBe(false)
    expect(result.entries).toEqual([])
    expect(mocks.request).toHaveBeenCalledTimes(MAX_PAGES)
  })

  it('stops early and reports incomplete when a page claims more without a cursor', async () => {
    mocks.request.mockResolvedValueOnce(page([event(30, ACCOUNT)], null, true))

    const result = (await run())._unsafeUnwrap()

    expect(result.isComplete).toBe(false)
    expect(result.entries.map((e) => e.blockNumber)).toEqual([30])
    expect(mocks.request).toHaveBeenCalledOnce()
  })

  it('keeps only root-resource events for the requested account', async () => {
    mocks.request.mockResolvedValueOnce(
      page(
        [
          event(4, ACCOUNT),
          event(3, ACCOUNT, NAME_RESOURCE),
          event(2, OTHER),
          event(1, getAddress(ACCOUNT)),
        ],
        'c1',
        false,
      ),
    )

    const result = (await run())._unsafeUnwrap()

    // The per-name grant and the other account drop out; the checksummed form
    // of the same account is still a match.
    expect(result.entries.map((e) => e.blockNumber)).toEqual([4, 1])
  })
})
