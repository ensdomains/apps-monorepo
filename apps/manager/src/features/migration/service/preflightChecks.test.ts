import { type Address, zeroAddress } from 'viem'
import { multicall, readContract } from 'viem/actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fail, makeClassified, OTHER, ok, publicClient } from './_fixtures'
import { FUSES } from './classifyNames'
import {
  checkFrozenApproval,
  resolveParentRegistries,
  runEligibilityChecks,
} from './preflightChecks'

vi.mock('viem/actions', () => ({
  multicall: vi.fn(),
  readContract: vi.fn(),
}))

const multicallMock = vi.mocked(multicall)
const readContractMock = vi.mocked(readContract)

beforeEach(() => {
  multicallMock.mockReset()
  readContractMock.mockReset()
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
    const result = await runEligibilityChecks(publicClient, [])
    expect(result).toEqual({ eligible: [], frozen: [] })
    expect(multicallMock).not.toHaveBeenCalled()
  })

  it('filters frozen approvals into eligibility buckets', async () => {
    const A = makeClassified({ id: '0xa1', label: 'a', name: 'a.eth' })
    const B = makeClassified({
      id: '0xb1',
      label: 'b',
      name: 'b.eth',
      tokenType: 'locked-2ld',
      fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_APPROVE,
    })
    const C = makeClassified({ id: '0xc1', label: 'c', name: 'c.eth' })

    multicallMock.mockResolvedValueOnce([ok(OTHER)]) // frozen approval, only B

    const result = await runEligibilityChecks(publicClient, [A, B, C])

    expect(result.frozen.map((n) => n.domain.id)).toEqual(['0xb1'])
    expect(result.eligible.map((n) => n.domain.id)).toEqual(['0xa1', '0xc1'])
    expect(multicallMock).toHaveBeenCalledTimes(1)
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
