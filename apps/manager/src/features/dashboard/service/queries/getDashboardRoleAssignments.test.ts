import indexerClient from '@ens-apps/indexer/urql'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getDashboardRoleAssignments,
  getDashboardRoleAssignmentsForAddresses,
} from './getDashboardRoleAssignments'

// Stub only the client — `graphqlRequest` stays real so these exercise the
// production unwrap path.
vi.mock('@ens-apps/indexer/urql', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ens-apps/indexer/urql')>()),
  default: { query: vi.fn() },
}))

const queryMock = vi.mocked(indexerClient.query)

const respond = (response: { data?: unknown; error?: unknown }): void => {
  queryMock.mockReturnValueOnce({
    toPromise: () => Promise.resolve(response),
  } as never)
}

const ADDR = '0x0000000000000000000000000000000000000001'

beforeEach(() => {
  queryMock.mockReset()
})

describe('getDashboardRoleAssignments', () => {
  it('returns role assignments from the indexer', async () => {
    respond({
      data: {
        roles: [
          { name: 'alaska.eth', roleBitmap: '1' },
          { name: null, roleBitmap: '0' },
        ],
      },
    })

    await expect(getDashboardRoleAssignments(ADDR)).resolves.toEqual([
      { name: 'alaska.eth', roleBitmap: '1' },
      { name: null, roleBitmap: '0' },
    ])
  })

  it('lowercases the account variable', async () => {
    respond({ data: { roles: [] } })

    await getDashboardRoleAssignments(
      '0xABCDEF0123456789ABCDEF0123456789ABCDEF01',
    )

    const vars = queryMock.mock.calls[0]?.[1] as { account?: string }
    expect(vars.account).toBe('0xabcdef0123456789abcdef0123456789abcdef01')
  })

  it.each([
    ['error', { error: new Error('indexer 500') }],
    ['no data and no error', {}],
  ] as const)('throws a tagged error on %s', async (_, response) => {
    respond(response)

    await expect(getDashboardRoleAssignments(ADDR)).rejects.toMatchObject({
      _tag: 'GetDashboardRoleAssignmentsError',
    })
  })

  it('fetches assignments for every unique address', async () => {
    respond({
      data: {
        account0: [{ name: 'alaska.eth', roleBitmap: '1' }],
        account1: [{ name: 'figma.eth', roleBitmap: '2' }],
      },
    })

    await expect(
      getDashboardRoleAssignmentsForAddresses([
        ADDR,
        '0x0000000000000000000000000000000000000002',
        ADDR.toUpperCase(),
      ]),
    ).resolves.toEqual([
      { name: 'alaska.eth', roleBitmap: '1' },
      { name: 'figma.eth', roleBitmap: '2' },
    ])

    expect(queryMock).toHaveBeenCalledTimes(1)
    const document = queryMock.mock.calls[0]?.[0] as string
    expect(document).toContain('account0: roles(account: $account0)')
    expect(document).toContain('account1: roles(account: $account1)')
    expect(queryMock.mock.calls[0]?.[1]).toEqual({
      account0: ADDR,
      account1: '0x0000000000000000000000000000000000000002',
    })
  })
})
