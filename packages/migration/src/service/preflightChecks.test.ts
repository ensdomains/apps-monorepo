import { type Address, zeroAddress } from 'viem'
import { multicall } from 'viem/actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fail,
  makeClassified,
  OTHER,
  OWNER,
  ok,
  publicClient,
} from './_fixtures'
import { FUSES } from './classifyNames'
import {
  checkFrozenApproval,
  checkLiveManagers,
  checkOwnership,
  checkPremigrationReservation,
  runEligibilityChecks,
} from './preflightChecks'

vi.mock('viem/actions', () => ({
  multicall: vi.fn(),
}))

const multicallMock = vi.mocked(multicall)

beforeEach(() => {
  multicallMock.mockReset()
})

const futureWrapperExpiry = () => BigInt(Math.floor(Date.now() / 1000) + 3600)

describe('checkOwnership', () => {
  it('returns empty set for empty input', async () => {
    expect((await checkOwnership(publicClient, [], OWNER)).size).toBe(0)
    expect(multicallMock).not.toHaveBeenCalled()
  })

  it('marks unwrapped names whose ownerOf differs from migrationOwner', async () => {
    multicallMock.mockResolvedValueOnce([ok(OTHER), ok(OWNER)])
    const ids = await checkOwnership(
      publicClient,
      [makeClassified({ id: '0xa1' }), makeClassified({ id: '0xb1' })],
      OWNER,
    )
    expect([...ids]).toEqual(['0xa1'])
  })

  it('marks wrapped names by comparing NameWrapper.getData[0] to migrationOwner', async () => {
    const expiry = futureWrapperExpiry()
    multicallMock.mockResolvedValueOnce([
      ok([OWNER, 0, expiry] as const),
      ok([OTHER, 0, expiry] as const),
    ])
    const ids = await checkOwnership(
      publicClient,
      [
        makeClassified({ id: '0xa1', tokenType: 'locked-2ld' }),
        makeClassified({ id: '0xb1', tokenType: 'locked-2ld' }),
      ],
      OWNER,
    )
    expect([...ids]).toEqual(['0xb1'])
  })

  it('marks wrapped names whose on-chain wrapper expiry is in the past', async () => {
    multicallMock.mockResolvedValueOnce([ok([OWNER, 0, 100n] as const)])
    const ids = await checkOwnership(
      publicClient,
      [makeClassified({ id: '0xa1', tokenType: 'locked-2ld' })],
      OWNER,
    )
    expect([...ids]).toEqual(['0xa1'])
  })

  it('marks IS_DOT_ETH names in their grace period (owned but not transferable)', async () => {
    // Wrapper expiry is still in the future (registrarExpiry + 90d grace), so getData
    // reports the name as owned — but it is inside the grace period, so a transfer would
    // revert with "insufficient balance". Must be excluded despite the owner matching.
    const graceExpiry = BigInt(Math.floor(Date.now() / 1000) + 3600)
    multicallMock.mockResolvedValueOnce([
      ok([OWNER, Number(FUSES.IS_DOT_ETH), graceExpiry] as const),
    ])
    const ids = await checkOwnership(
      publicClient,
      [makeClassified({ id: '0xa1', tokenType: 'locked-2ld' })],
      OWNER,
    )
    expect([...ids]).toEqual(['0xa1'])
  })

  it('keeps IS_DOT_ETH names transferable when past the grace period start', async () => {
    // Wrapper expiry more than 90 days out → registration still live → transferable.
    const liveExpiry = BigInt(
      Math.floor(Date.now() / 1000) + 120 * 24 * 60 * 60,
    )
    multicallMock.mockResolvedValueOnce([
      ok([OWNER, Number(FUSES.IS_DOT_ETH), liveExpiry] as const),
    ])
    const ids = await checkOwnership(
      publicClient,
      [makeClassified({ id: '0xa1', tokenType: 'locked-2ld' })],
      OWNER,
    )
    expect(ids.size).toBe(0)
  })

  it('treats a failed multicall entry as already migrated', async () => {
    multicallMock.mockResolvedValueOnce([fail()])
    const ids = await checkOwnership(
      publicClient,
      [makeClassified({ id: '0xa1' })],
      OWNER,
    )
    expect([...ids]).toEqual(['0xa1'])
  })

  it('is case-insensitive on the owner comparison', async () => {
    multicallMock.mockResolvedValueOnce([
      ok(OWNER.toUpperCase() as unknown as Address),
    ])
    const ids = await checkOwnership(
      publicClient,
      [makeClassified({ id: '0xa1' })],
      OWNER,
    )
    expect(ids.size).toBe(0)
  })
})

describe('checkFrozenApproval', () => {
  it('returns empty set when no candidates', async () => {
    expect((await checkFrozenApproval(publicClient, [])).size).toBe(0)
  })

  it('marks candidates whose getApproved is non-zero', async () => {
    multicallMock.mockResolvedValueOnce([ok(OTHER), ok(zeroAddress)])
    const ids = await checkFrozenApproval(publicClient, [
      makeClassified({ id: '0xa1', tokenType: 'locked-2ld' }),
      makeClassified({ id: '0xb1', tokenType: 'locked-2ld' }),
    ])
    expect([...ids]).toEqual(['0xa1'])
  })

  it('fails closed: multicall failure is treated as frozen', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    multicallMock.mockResolvedValueOnce([fail()])
    const ids = await checkFrozenApproval(publicClient, [
      makeClassified({ id: '0xa1', tokenType: 'locked-2ld' }),
    ])
    expect([...ids]).toEqual(['0xa1'])
    warn.mockRestore()
  })
})

describe('checkPremigrationReservation', () => {
  it('marks 2LDs that are not RESERVED and ignores child registries', async () => {
    multicallMock.mockResolvedValueOnce([ok(1), ok(0)])
    const reserved = makeClassified({ id: '0xa1', labelhash: '0xa1' })
    const available = makeClassified({ id: '0xb1', labelhash: '0xb1' })
    const child = makeClassified({
      id: '0xc1',
      labelhash: '0xc1',
      tokenType: 'locked-child',
      parentName: 'parent.eth',
    })

    const ids = await checkPremigrationReservation(publicClient, [
      reserved,
      available,
      child,
    ])

    expect([...ids]).toEqual(['0xb1'])
    expect(multicallMock).toHaveBeenCalledOnce()
    expect(multicallMock.mock.calls[0]?.[1].contracts).toHaveLength(2)
  })

  it('fails closed when a reservation read fails', async () => {
    multicallMock.mockResolvedValueOnce([fail()])
    const failed = new Set<string>()
    const name = makeClassified({ id: '0xa1', labelhash: '0xa1' })

    const ids = await checkPremigrationReservation(publicClient, [name], failed)

    expect([...ids]).toEqual(['0xa1'])
    expect([...failed]).toEqual(['0xa1'])
  })
})

describe('runEligibilityChecks', () => {
  it('returns empty buckets for empty input and issues no RPC', async () => {
    const result = await runEligibilityChecks(publicClient, [], OWNER)
    expect(result).toEqual({
      eligible: [],
      frozen: [],
      alreadyMigrated: [],
      notPremigrated: [],
      failed: [],
    })
    expect(multicallMock).not.toHaveBeenCalled()
  })

  it('composes ownership and frozen into the three buckets', async () => {
    const A = makeClassified({ id: '0xa1', label: 'a', name: 'a.eth' })
    const B = makeClassified({
      id: '0xb1',
      label: 'b',
      name: 'b.eth',
      tokenType: 'locked-2ld',
      fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_APPROVE,
    })
    const C = makeClassified({ id: '0xc1', label: 'c', name: 'c.eth' })
    const expiry = futureWrapperExpiry()

    multicallMock
      .mockResolvedValueOnce([
        ok(OTHER),
        ok([OWNER, 0, expiry] as const),
        ok(OWNER),
      ]) // ownership
      .mockResolvedValueOnce([ok(OTHER)]) // frozen-approval (only B)
      .mockResolvedValueOnce([ok(1), ok(1), ok(1)]) // v2 reservations

    const result = await runEligibilityChecks(publicClient, [A, B, C], OWNER)

    expect(result.alreadyMigrated.map((n) => n.domain.id)).toEqual(['0xa1'])
    expect(result.frozen.map((n) => n.domain.id)).toEqual(['0xb1'])
    expect(result.eligible.map((n) => n.domain.id)).toEqual(['0xc1'])
    expect(result.notPremigrated).toEqual([])
    expect(result.failed).toEqual([])
    expect(multicallMock).toHaveBeenCalledTimes(3)
  })

  it('reports unreadable ownership checks in `failed` (and keeps them out of eligible)', async () => {
    const A = makeClassified({ id: '0xa1', label: 'a', name: 'a.eth' })
    multicallMock
      .mockResolvedValueOnce([fail()]) // ownership read failed
      .mockResolvedValueOnce([ok(1)]) // v2 reservation

    const result = await runEligibilityChecks(publicClient, [A], OWNER)

    expect(result.failed.map((n) => n.domain.id)).toEqual(['0xa1'])
    expect(result.eligible).toEqual([])
    // stays fail-closed for the mutation path
    expect(result.alreadyMigrated.map((n) => n.domain.id)).toEqual(['0xa1'])
  })

  it('keeps an AVAILABLE v2 name out of the migration selection', async () => {
    const A = makeClassified({ id: '0xa1', labelhash: '0xa1' })
    multicallMock
      .mockResolvedValueOnce([ok(OWNER)]) // ownership
      .mockResolvedValueOnce([ok(0)]) // v2 reservation

    const result = await runEligibilityChecks(publicClient, [A], OWNER)

    expect(result.eligible).toEqual([])
    expect(result.notPremigrated).toEqual([A])
    expect(result.failed).toEqual([])
  })
})

describe('checkLiveManagers', () => {
  it('issues no RPC when no name claims a manager', async () => {
    const A = makeClassified({ id: '0xa1' })
    const result = await checkLiveManagers(publicClient, [A])

    expect(result.managers.size).toBe(0)
    expect(result.unreadable.size).toBe(0)
    // The snapshot reports no delegation, so the plan appends no grant and there is
    // no authorization to verify.
    expect(multicallMock).not.toHaveBeenCalled()
  })

  it('reads the live registry only for names that claim a manager', async () => {
    const withManager = makeClassified({ id: '0xa1', managerAddress: OTHER })
    const without = makeClassified({ id: '0xb1' })
    multicallMock.mockResolvedValueOnce([ok(OTHER)])

    await checkLiveManagers(publicClient, [withManager, without])

    expect(multicallMock).toHaveBeenCalledTimes(1)
    const call = multicallMock.mock.calls[0]
    expect(call).toBeDefined()
    const contracts = call?.[1].contracts ?? []
    expect(contracts).toHaveLength(1)
    expect(contracts[0]).toMatchObject({
      functionName: 'owner',
      args: ['0xa1'],
    })
  })

  it('keeps a manager the live registry still confirms', async () => {
    const A = makeClassified({ id: '0xa1', managerAddress: OTHER })
    multicallMock.mockResolvedValueOnce([ok(OTHER)])

    const result = await checkLiveManagers(publicClient, [A])

    expect(result.managers.get('0xa1')).toBe(OTHER)
  })

  it('drops a manager the registrant has already reclaimed', async () => {
    // The exact stale-snapshot case: the index still names OTHER, but the live
    // registry says the role came back to the registrant.
    const A = makeClassified({ id: '0xa1', managerAddress: OTHER })
    multicallMock.mockResolvedValueOnce([ok(OWNER)])

    const result = await checkLiveManagers(publicClient, [A])

    expect(result.managers.get('0xa1')).toBeNull()
  })

  it('replaces a stale manager with whoever holds the role now', async () => {
    const A = makeClassified({ id: '0xa1', managerAddress: OTHER })
    const THIRD: Address = '0x0000000000000000000000000000000000000003'
    multicallMock.mockResolvedValueOnce([ok(THIRD)])

    const result = await checkLiveManagers(publicClient, [A])

    expect(result.managers.get('0xa1')).toBe(THIRD)
  })

  it('fails closed when the live manager cannot be read', async () => {
    const A = makeClassified({ id: '0xa1', managerAddress: OTHER })
    const failedIds = new Set<string>()
    multicallMock.mockResolvedValueOnce([fail()])

    const result = await checkLiveManagers(publicClient, [A], failedIds)

    expect(result.unreadable.has('0xa1')).toBe(true)
    expect(result.managers.has('0xa1')).toBe(false)
    expect(failedIds.has('0xa1')).toBe(true)
  })
})

describe('runEligibilityChecks — live manager overrides the subgraph', () => {
  it('never carries a revoked manager into the eligible set', async () => {
    // Regression: the subgraph snapshot still names OTHER as manager, but the
    // registrant reclaimed the role. `buildRoleGrantCall` turns `managerAddress`
    // straight into `grantRoles(name, ROLE_SET_RESOLVER, …)`, so a stale value here
    // hands resolver control of the name to an address that no longer holds anything.
    const A = makeClassified({ id: '0xa1', managerAddress: OTHER })
    multicallMock
      .mockResolvedValueOnce([ok(OWNER)]) // ownership — victim holds the registration
      .mockResolvedValueOnce([ok(1)]) // v2 reservation — RESERVED
      .mockResolvedValueOnce([ok(OWNER)]) // live V1 registry — reclaimed by the victim

    const result = await runEligibilityChecks(publicClient, [A], OWNER)

    expect(result.eligible).toHaveLength(1)
    expect(result.eligible[0]?.managerAddress).toBeNull()
    expect(result.failed).toEqual([])
  })

  it('preserves a manager that is still live', async () => {
    const A = makeClassified({ id: '0xa1', managerAddress: OTHER })
    multicallMock
      .mockResolvedValueOnce([ok(OWNER)]) // ownership
      .mockResolvedValueOnce([ok(1)]) // v2 reservation
      .mockResolvedValueOnce([ok(OTHER)]) // live V1 registry — still delegated

    const result = await runEligibilityChecks(publicClient, [A], OWNER)

    expect(result.eligible[0]?.managerAddress).toBe(OTHER)
  })

  it('drops a name whose live manager is unreadable rather than trusting the snapshot', async () => {
    const A = makeClassified({ id: '0xa1', managerAddress: OTHER })
    multicallMock
      .mockResolvedValueOnce([ok(OWNER)]) // ownership
      .mockResolvedValueOnce([ok(1)]) // v2 reservation
      .mockResolvedValueOnce([fail()]) // live V1 registry unreadable

    const result = await runEligibilityChecks(publicClient, [A], OWNER)

    expect(result.eligible).toEqual([])
    expect(result.failed.map((n) => n.domain.id)).toEqual(['0xa1'])
  })

  it('leaves names without a claimed manager untouched and issues no extra call', async () => {
    const A = makeClassified({ id: '0xa1' })
    multicallMock
      .mockResolvedValueOnce([ok(OWNER)]) // ownership
      .mockResolvedValueOnce([ok(1)]) // v2 reservation

    const result = await runEligibilityChecks(publicClient, [A], OWNER)

    expect(result.eligible).toEqual([A])
    expect(multicallMock).toHaveBeenCalledTimes(2)
  })
})
