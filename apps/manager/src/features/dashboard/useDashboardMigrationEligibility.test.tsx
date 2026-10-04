import { renderHook } from '@testing-library/react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const migrationEligibilityMock = vi.hoisted(() => ({
  useMigrationEligibility: vi.fn(),
}))
const v1NamesMock = vi.hoisted(() => ({ useV1Names: vi.fn() }))
const smartAccountMock = vi.hoisted(() => ({
  useSmartAccountContext: vi.fn(),
}))
const wagmiMock = vi.hoisted(() => ({ useConnection: vi.fn() }))
const classifyNamesMock = vi.hoisted(() => ({ classifyNames: vi.fn() }))

vi.mock(
  '@/features/migration/hooks/useMigrationEligibility',
  () => migrationEligibilityMock,
)
vi.mock('@/features/migration/hooks/useV1Names', () => v1NamesMock)
vi.mock('@/features/migration/service/classifyNames', () => classifyNamesMock)
vi.mock('@/lib/smart-account', () => smartAccountMock)
vi.mock('wagmi', () => wagmiMock)

import { useDashboardMigrationEligibility } from './useDashboardMigrationEligibility'

const USER = '0x1111111111111111111111111111111111111111' as Address

const classified = (name: string) => ({ domain: { id: `0x${name}`, name } })

describe('useDashboardMigrationEligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    smartAccountMock.useSmartAccountContext.mockReturnValue({
      ownerAddress: USER,
    })
    wagmiMock.useConnection.mockReturnValue({ address: undefined })
    v1NamesMock.useV1Names.mockReturnValue({
      data: [{}],
      isPending: false,
      isError: false,
    })
    classifyNamesMock.classifyNames.mockReturnValue({
      classified: [classified('Alpha.eth'), classified('beta.eth')],
    })
    migrationEligibilityMock.useMigrationEligibility.mockReturnValue({
      data: undefined,
      isPending: false,
    })
  })

  it('reads nothing while migration is disabled', () => {
    v1NamesMock.useV1Names.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    })

    const { result } = renderHook(() =>
      useDashboardMigrationEligibility({ migrationEnabled: false }),
    )

    expect(v1NamesMock.useV1Names).toHaveBeenCalledWith({ enabled: false })
    expect(result.current.eligibleNames.size).toBe(0)
    expect(result.current.isPending).toBe(false)
  })

  it('uses the classified names until the eligibility checks settle', () => {
    const { result } = renderHook(() =>
      useDashboardMigrationEligibility({ migrationEnabled: true }),
    )

    expect([...result.current.eligibleNames]).toEqual(['alpha.eth', 'beta.eth'])
  })

  it('narrows to the names that pass the eligibility checks', () => {
    migrationEligibilityMock.useMigrationEligibility.mockReturnValue({
      data: { eligible: [classified('beta.eth')] },
      isPending: false,
    })

    const { result } = renderHook(() =>
      useDashboardMigrationEligibility({ migrationEnabled: true }),
    )

    expect([...result.current.eligibleNames]).toEqual(['beta.eth'])
  })
})
