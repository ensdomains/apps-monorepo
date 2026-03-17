import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRoleTransactions } from './buildRoleTransactions'

const TEST_ACCOUNT = '0x1234567890123456789012345678901234567890' as const
const TEST_ACCOUNT_2 = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as const

describe('buildRoleTransactions', () => {
  const mockHandlers = {
    grantRoles: vi.fn(),
    revokeRoles: vi.fn(),
    handleDone: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when no pending state', () => {
    const result = buildRoleTransactions(null, null, 'test.eth', mockHandlers)
    expect(result).toEqual([])
    expect(mockHandlers.grantRoles).not.toHaveBeenCalled()
    expect(mockHandlers.revokeRoles).not.toHaveBeenCalled()
    expect(mockHandlers.handleDone).not.toHaveBeenCalled()
  })

  it('returns transaction with correct structure for single grant', () => {
    const result = buildRoleTransactions(
      {
        account: TEST_ACCOUNT,
        rolesToGrant: ['ROLE_RENEW'],
        rolesToRevoke: [],
      },
      null,
      'test.eth',
      mockHandlers,
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'tx-grant-roles',
      title: 'Grant roles',
      transactionName: 'Grant roles for test.eth',
      estimatedGasCost: 0.0001,
    })
    expect(typeof result[0].onStart).toBe('function')
    expect(typeof result[0].onDone).toBe('function')

    result[0].onStart()
    expect(mockHandlers.grantRoles).toHaveBeenCalledWith({
      name: 'test.eth',
      account: TEST_ACCOUNT,
      roles: ['ROLE_RENEW'],
      id: 'tx-grant-roles',
    })

    result[0].onDone()
    expect(mockHandlers.handleDone).toHaveBeenCalled()
  })

  it('chains grant onDone to revoke when both present', () => {
    const result = buildRoleTransactions(
      {
        account: TEST_ACCOUNT,
        rolesToGrant: ['ROLE_RENEW'],
        rolesToRevoke: ['ROLE_BURN'],
      },
      null,
      'example.eth',
      mockHandlers,
    )

    expect(result).toHaveLength(2)

    result[0].onDone()
    expect(mockHandlers.revokeRoles).toHaveBeenCalledWith({
      name: 'example.eth',
      account: TEST_ACCOUNT,
      roles: ['ROLE_BURN'],
      id: 'tx-revoke-roles',
    })
    expect(mockHandlers.handleDone).not.toHaveBeenCalled()

    result[1].onDone()
    expect(mockHandlers.handleDone).toHaveBeenCalled()
  })

  it('returns remove user transaction for pendingRemove', () => {
    const result = buildRoleTransactions(
      null,
      { account: TEST_ACCOUNT_2, roles: ['ROLE_BURN'] },
      'parent.eth',
      mockHandlers,
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'tx-revoke-roles',
      title: 'Remove user',
      transactionName: 'Remove user from parent.eth',
    })

    result[0].onStart()
    expect(mockHandlers.revokeRoles).toHaveBeenCalledWith({
      name: 'parent.eth',
      account: TEST_ACCOUNT_2,
      roles: ['ROLE_BURN'],
      id: 'tx-revoke-roles',
    })
  })
})
