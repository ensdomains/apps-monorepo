import { act, renderHook } from '@testing-library/react'
import { type Address, namehash } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useMigrationEligibility: vi.fn(),
  useMigrationRecoverySnapshot: vi.fn(),
  useSmartAccountContext: vi.fn(),
  useV1Names: vi.fn(),
  useConnection: vi.fn(),
}))

vi.mock('./useMigrationEligibility', () => ({
  useMigrationEligibility: mocks.useMigrationEligibility,
}))
vi.mock('./useMigrationRecoverySnapshot', () => ({
  useMigrationRecoverySnapshot: mocks.useMigrationRecoverySnapshot,
}))
vi.mock('./useV1Names', () => ({ useV1Names: mocks.useV1Names }))
vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: mocks.useSmartAccountContext,
}))
vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnection: mocks.useConnection,
}))

import { makeDomain } from '../service/_fixtures'
import type { MigrationRecoverySnapshot } from '../service/migrationBatchJournal'
import { useEligibleV1Names } from './useEligibleV1Names'

const OWNER = '0x0000000000000000000000000000000000000001' as Address
const RESOLVER = '0x0000000000000000000000000000000000000003' as Address
const EMPTY_PROFILE = {
  texts: [],
  addresses: [],
  contentHash: null,
  abis: [],
} as const

const recoverySnapshot = (params?: {
  readonly registrationExpiry?: string
}): MigrationRecoverySnapshot => {
  const root = makeDomain({
    id: namehash('example.eth'),
    name: 'example.eth',
    labelName: 'example',
    resolverAddress: null,
    registrationExpiry: params?.registrationExpiry,
  })
  const copy = makeDomain({
    id: namehash('foo.example.eth'),
    name: 'foo.example.eth',
    labelName: 'foo',
    parentName: root.name,
    registrantId: null,
    resolverAddress: null,
  })

  return {
    registryDomains: [root, copy],
    registryOperations: [
      { name: root.name, action: 'migrate' },
      { name: copy.name, action: 'copy' },
    ],
    remainingOperations: [{ name: copy.name, action: 'copy' }],
    completedOperations: [{ name: root.name, action: 'migrate' }],
    profiles: new Map([
      [namehash(root.name), EMPTY_PROFILE],
      [namehash(copy.name), EMPTY_PROFILE],
    ]),
    ownedPermRes: RESOLVER,
    plannedApprovals: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useSmartAccountContext.mockReturnValue({ ownerAddress: OWNER })
  mocks.useConnection.mockReturnValue({ address: OWNER })
  mocks.useV1Names.mockReturnValue({ data: [], isPending: false })
  mocks.useMigrationRecoverySnapshot.mockReturnValue(null)
  mocks.useMigrationEligibility.mockReturnValue({
    data: undefined,
    isPending: false,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useEligibleV1Names grace-period names', () => {
  it.each([
    false,
    true,
  ])('removes a grace-period row at its exact grace boundary (wrapped: %s)', (isWrapped) => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000_000_500)
    const graceName = makeDomain({
      isWrapped,
      registrationExpiry: isWrapped ? null : '2224001',
      wrappedExpiry: isWrapped ? '10000001' : undefined,
    })
    mocks.useV1Names.mockReturnValue({ data: [graceName], isPending: false })
    const { result, unmount } = renderHook(() => useEligibleV1Names())

    expect(result.current.gracePeriodNames).toHaveLength(1)
    act(() => vi.advanceTimersByTime(499))
    expect(result.current.gracePeriodNames).toHaveLength(1)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.gracePeriodNames).toEqual([])
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('moves a newly expired name out of cached eligibility and into grace', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000_000_000)
    const active = makeDomain({ registrationExpiry: '10000001' })
    mocks.useV1Names.mockReturnValue({ data: [active], isPending: false })
    const { result } = renderHook(() => useEligibleV1Names())
    mocks.useMigrationEligibility.mockReturnValue({
      data: { eligible: result.current.eligible },
      isPending: false,
    })

    expect(result.current.eligible).toHaveLength(1)
    act(() => vi.advanceTimersByTime(1000))

    expect(result.current.eligible).toEqual([])
    expect(result.current.gracePeriodNames).toEqual([
      { domain: active, reason: 'expired-registration' },
    ])
  })

  it.each([
    'focus',
    'visibilitychange',
  ])('catches up after a suspended tab receives %s', (event) => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000_000_000)
    const graceName = makeDomain({ registrationExpiry: '2224001' })
    mocks.useV1Names.mockReturnValue({ data: [graceName], isPending: false })
    const { result } = renderHook(() => useEligibleV1Names())

    expect(result.current.gracePeriodNames).toHaveLength(1)
    vi.setSystemTime(10_000_002_000)
    act(() => {
      const target = event === 'focus' ? window : document
      target.dispatchEvent(new Event(event))
    })

    expect(result.current.gracePeriodNames).toEqual([])
  })

  it('reschedules expiry boundaries when a name is renewed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000_000_000)
    const name = makeDomain({ registrationExpiry: '10000001' })
    mocks.useV1Names.mockReturnValue({ data: [name], isPending: false })
    const { result, rerender } = renderHook(() => useEligibleV1Names())
    const renewedName = makeDomain({ registrationExpiry: '10000002' })
    mocks.useV1Names.mockReturnValue({ data: [renewedName], isPending: false })
    rerender()

    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.eligible).toHaveLength(1)
    expect(result.current.gracePeriodNames).toEqual([])
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.eligible).toEqual([])
    expect(result.current.gracePeriodNames).toHaveLength(1)
  })

  it('does not overflow browser timers for distant expiry dates', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000_000_000)
    const name = makeDomain({ registrationExpiry: '20000000' })
    mocks.useV1Names.mockReturnValue({ data: [name], isPending: false })
    const { result } = renderHook(() => useEligibleV1Names())

    act(() => vi.advanceTimersByTime(2_147_483_647))

    expect(result.current.eligible).toHaveLength(1)
    expect(result.current.gracePeriodNames).toEqual([])
    expect(vi.getTimerCount()).toBe(1)
  })

  it('retains wrapped and unwrapped grace names separately from eligible names', () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000_000_000)
    const active = makeDomain({
      id: namehash('active.eth'),
      name: 'active.eth',
      labelName: 'active',
      registrationExpiry: '10000001',
    })
    const unwrappedGrace = makeDomain({
      id: namehash('unwrapped.eth'),
      name: 'unwrapped.eth',
      labelName: 'unwrapped',
      registrationExpiry: '9999999',
    })
    const wrappedGrace = makeDomain({
      id: namehash('wrapped.eth'),
      name: 'wrapped.eth',
      labelName: 'wrapped',
      isWrapped: true,
      registrationExpiry: '9999999',
      wrappedExpiry: '17775999',
    })
    mocks.useV1Names.mockReturnValue({
      data: [active, unwrappedGrace, wrappedGrace],
      isPending: false,
    })

    const { result } = renderHook(() => useEligibleV1Names())

    expect(result.current.eligible.map(({ domain }) => domain.name)).toEqual([
      'active.eth',
    ])
    expect(result.current.gracePeriodNames).toEqual([
      { domain: unwrappedGrace, reason: 'expired-registration' },
      { domain: wrappedGrace, reason: 'expired-registration' },
    ])
    expect(result.current.isPending).toBe(false)
    expect(mocks.useMigrationEligibility).toHaveBeenCalledWith(
      [expect.objectContaining({ domain: active })],
      OWNER,
    )
  })
})

describe('useEligibleV1Names durable recovery', () => {
  it('surfaces the remaining copy even after the migrated root disappears from V1 results', () => {
    mocks.useMigrationRecoverySnapshot.mockReturnValue(recoverySnapshot())

    const { result } = renderHook(() => useEligibleV1Names())

    expect(result.current.isPending).toBe(false)
    expect(result.current.gracePeriodNames).toEqual([])
    expect(result.current.recoveryState).toEqual({ status: 'recovering' })
    expect(result.current.eligible).toEqual([
      expect.objectContaining({
        action: 'copy',
        domain: expect.objectContaining({ name: 'foo.example.eth' }),
        managerAddress: null,
      }),
    ])
    expect(mocks.useMigrationEligibility).toHaveBeenCalledWith([], OWNER)
  })

  it('returns a typed stale state instead of throwing when the saved root enters grace', () => {
    vi.spyOn(Date, 'now').mockReturnValue(2_001_000)
    mocks.useMigrationRecoverySnapshot.mockReturnValue(
      recoverySnapshot({ registrationExpiry: '2000' }),
    )

    const { result } = renderHook(() => useEligibleV1Names())

    expect(result.current.eligible).toEqual([])
    expect(result.current.gracePeriodNames).toEqual([])
    expect(result.current.isPending).toBe(false)
    expect(result.current.recoveryState).toMatchObject({
      status: 'stale',
      error: {
        name: 'MigrationRecoveryPlanError',
        reason: 'classification-changed',
      },
    })
    expect(mocks.useMigrationEligibility).toHaveBeenCalledWith([], OWNER)
  })
})
