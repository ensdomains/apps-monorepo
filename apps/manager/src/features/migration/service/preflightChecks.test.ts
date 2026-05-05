import { type Address, zeroAddress } from 'viem'
import { multicall, readContract } from 'viem/actions'
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
import { getRegisteredV2Names } from './getRegisteredV2Names'
import {
  checkFrozenApproval,
  checkOwnership,
  checkV2Status,
  resolveParentRegistries,
  runEligibilityChecks,
} from './preflightChecks'

vi.mock('viem/actions', () => ({
  multicall: vi.fn(),
  readContract: vi.fn(),
}))

vi.mock('./getRegisteredV2Names', () => ({
  getRegisteredV2Names: vi.fn(),
}))

const multicallMock = vi.mocked(multicall)
const readContractMock = vi.mocked(readContract)
const getRegisteredV2NamesMock = vi.mocked(getRegisteredV2Names)

beforeEach(() => {
  multicallMock.mockReset()
  readContractMock.mockReset()
  getRegisteredV2NamesMock.mockReset()
  getRegisteredV2NamesMock.mockResolvedValue(new Set())
})

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
    multicallMock.mockResolvedValueOnce([
      ok([OWNER, 0, 0n] as const),
      ok([OTHER, 0, 0n] as const),
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

describe('checkV2Status', () => {
  it('returns empty set for empty input and issues no subgraph call', async () => {
    expect((await checkV2Status([])).size).toBe(0)
    expect(getRegisteredV2NamesMock).not.toHaveBeenCalled()
  })

  it('marks names present in the v2 subgraph (case-insensitive)', async () => {
    getRegisteredV2NamesMock.mockResolvedValue(new Set(['alice.eth']))
    const ids = await checkV2Status([
      makeClassified({ id: '0xa1', name: 'ALICE.ETH' }),
      makeClassified({ id: '0xb1', name: 'bob.eth' }),
    ])
    expect([...ids]).toEqual(['0xa1'])
    expect(multicallMock).not.toHaveBeenCalled()
  })

  it('propagates subgraph errors instead of falling back to RPC', async () => {
    getRegisteredV2NamesMock.mockRejectedValueOnce(new Error('subgraph down'))
    await expect(
      checkV2Status([makeClassified({ id: '0xa1' })]),
    ).rejects.toThrow('subgraph down')
    expect(multicallMock).not.toHaveBeenCalled()
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

describe('runEligibilityChecks', () => {
  it('returns empty buckets for empty input and issues no RPC', async () => {
    const result = await runEligibilityChecks(publicClient, [], OWNER)
    expect(result).toEqual({ eligible: [], frozen: [], alreadyMigrated: [] })
    expect(multicallMock).not.toHaveBeenCalled()
  })

  it('composes ownership, v2-status and frozen into the three buckets', async () => {
    const A = makeClassified({ id: '0xa1', label: 'a', name: 'a.eth' })
    const B = makeClassified({
      id: '0xb1',
      label: 'b',
      name: 'b.eth',
      tokenType: 'locked-2ld',
      fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_APPROVE,
    })
    const C = makeClassified({ id: '0xc1', label: 'c', name: 'c.eth' })

    multicallMock
      .mockResolvedValueOnce([
        ok(OTHER),
        ok([OWNER, 0, 0n] as const),
        ok(OWNER),
      ]) // ownership
      .mockResolvedValueOnce([ok(OTHER)]) // frozen-approval (only B)
    getRegisteredV2NamesMock.mockResolvedValueOnce(new Set()) // v2 subgraph

    const result = await runEligibilityChecks(publicClient, [A, B, C], OWNER)

    expect(result.alreadyMigrated.map((n) => n.domain.id)).toEqual(['0xa1'])
    expect(result.frozen.map((n) => n.domain.id)).toEqual(['0xb1'])
    expect(result.eligible.map((n) => n.domain.id)).toEqual(['0xc1'])
    expect(multicallMock).toHaveBeenCalledTimes(2)
  })
})

describe('resolveParentRegistries', () => {
  it('returns empty map for empty input and issues no RPC', async () => {
    const result = await resolveParentRegistries(publicClient, new Map())
    expect(result.size).toBe(0)
  })

  it('resolves a single-label parent with one first-hop multicall', async () => {
    const parent: Address = '0x0000000000000000000000000000000000000a01'
    multicallMock.mockResolvedValueOnce([ok(parent)])

    const result = await resolveParentRegistries(
      publicClient,
      new Map([
        [
          'raffy.eth',
          [
            makeClassified({
              tokenType: 'locked-child',
              parentName: 'raffy.eth',
              name: 'sub.raffy.eth',
            }),
          ],
        ],
      ]),
    )
    expect(result.get('raffy.eth')).toBe(parent)
    expect(multicallMock).toHaveBeenCalledTimes(1)
  })

  it('walks deep registry for multi-label parents', async () => {
    const firstHop: Address = '0x0000000000000000000000000000000000000b01'
    const deeper: Address = '0x0000000000000000000000000000000000000b02'
    multicallMock.mockResolvedValueOnce([ok(firstHop)])
    readContractMock.mockResolvedValueOnce(deeper)

    const result = await resolveParentRegistries(
      publicClient,
      new Map([
        [
          'a.b.eth',
          [
            makeClassified({
              tokenType: 'locked-child',
              parentName: 'a.b.eth',
              name: 'x.a.b.eth',
            }),
          ],
        ],
      ]),
    )
    expect(result.get('a.b.eth')).toBe(deeper)
  })

  it('short-circuits to zeroAddress when first hop is zero', async () => {
    multicallMock.mockResolvedValue([ok(zeroAddress)])

    vi.useFakeTimers()
    const pending = resolveParentRegistries(
      publicClient,
      new Map([
        [
          'a.b.eth',
          [
            makeClassified({
              tokenType: 'locked-child',
              parentName: 'a.b.eth',
              name: 'x.a.b.eth',
            }),
          ],
        ],
      ]),
    )
    await vi.runAllTimersAsync()
    const result = await pending
    vi.useRealTimers()

    expect(result.get('a.b.eth')).toBe(zeroAddress)
    expect(multicallMock).toHaveBeenCalledTimes(3)
  })
})
