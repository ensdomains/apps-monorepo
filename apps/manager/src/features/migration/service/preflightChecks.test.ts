import { type Address, type PublicClient, zeroAddress } from 'viem'
import { multicall, readContract } from 'viem/actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClassifiedName } from './classifyNames'
import { FUSES } from './classifyNames'
import {
  checkFrozenApproval,
  checkOwnership,
  checkV2Status,
  resolveParentRegistries,
  runEligibilityChecks,
} from './preflightChecks'
import type { V1Domain } from './v1SubgraphClient'

vi.mock('viem/actions', () => ({
  multicall: vi.fn(),
  readContract: vi.fn(),
}))

const multicallMock = vi.mocked(multicall)
const readContractMock = vi.mocked(readContract)

const OWNER: Address = '0x0000000000000000000000000000000000000001'
const OTHER: Address = '0x0000000000000000000000000000000000000002'

// biome-ignore lint/suspicious/noExplicitAny: test fixture only passed through
const publicClient = {} as PublicClient

type Overrides = {
  tokenType?: ClassifiedName['tokenType']
  id?: string
  labelhash?: string
  label?: string
  name?: string
  parentName?: string | null
  fuses?: number
}

const makeClassified = (o: Overrides = {}): ClassifiedName => ({
  tokenType: o.tokenType ?? 'unwrapped',
  label: o.label ?? 'alice',
  parentName: o.parentName === undefined ? 'eth' : o.parentName,
  fuses: o.fuses ?? 0,
  tokenHolder: OWNER,
  v1ResolverAddress: null,
  resolverStrategy: 'to-owned-permres',
  managerAddress: null,
  domain: {
    id: o.id ?? '0x01',
    labelhash: o.labelhash ?? '0x02',
    name: o.name ?? 'alice.eth',
  } as unknown as V1Domain,
})

const ok = <T>(result: T) => ({ status: 'success' as const, result })
const fail = () => ({
  status: 'failure' as const,
  error: new Error('reverted'),
  result: undefined,
})

beforeEach(() => {
  multicallMock.mockReset()
  readContractMock.mockReset()
})

describe('checkOwnership', () => {
  it('returns empty set for empty input', async () => {
    const ids = await checkOwnership(publicClient, [], OWNER)
    expect(ids.size).toBe(0)
    expect(multicallMock).not.toHaveBeenCalled()
  })

  it('marks unwrapped names whose ownerOf differs from migrationOwner', async () => {
    multicallMock.mockResolvedValueOnce([ok(OTHER), ok(OWNER)])
    const a = makeClassified({ id: '0xa1', tokenType: 'unwrapped' })
    const b = makeClassified({ id: '0xb1', tokenType: 'unwrapped' })
    const ids = await checkOwnership(publicClient, [a, b], OWNER)
    expect([...ids]).toEqual(['0xa1'])
  })

  it('marks wrapped names by comparing NameWrapper.getData[0] to migrationOwner', async () => {
    multicallMock.mockResolvedValueOnce([
      ok([OWNER, 0, 0n] as const),
      ok([OTHER, 0, 0n] as const),
    ])
    const a = makeClassified({ id: '0xa1', tokenType: 'locked-2ld' })
    const b = makeClassified({ id: '0xb1', tokenType: 'locked-2ld' })
    const ids = await checkOwnership(publicClient, [a, b], OWNER)
    expect([...ids]).toEqual(['0xb1'])
  })

  it('treats a failed multicall entry as already migrated', async () => {
    multicallMock.mockResolvedValueOnce([fail()])
    const a = makeClassified({ id: '0xa1' })
    const ids = await checkOwnership(publicClient, [a], OWNER)
    expect([...ids]).toEqual(['0xa1'])
  })

  it('is case-insensitive on the owner comparison', async () => {
    const upper = OWNER.toUpperCase()
    multicallMock.mockResolvedValueOnce([ok(upper as unknown as Address)])
    const a = makeClassified({ id: '0xa1' })
    const ids = await checkOwnership(publicClient, [a], OWNER)
    expect(ids.size).toBe(0)
  })
})

describe('checkV2Status', () => {
  it('returns empty set for empty input', async () => {
    const ids = await checkV2Status(publicClient, [])
    expect(ids.size).toBe(0)
    expect(multicallMock).not.toHaveBeenCalled()
  })

  it('marks names whose getStatus == REGISTERED (2)', async () => {
    multicallMock.mockResolvedValueOnce([ok(2), ok(0)])
    const a = makeClassified({ id: '0xa1' })
    const b = makeClassified({ id: '0xb1' })
    const ids = await checkV2Status(publicClient, [a, b])
    expect([...ids]).toEqual(['0xa1'])
  })

  it('fails closed: multicall failure is treated as registered', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    multicallMock.mockResolvedValueOnce([fail()])
    const a = makeClassified({ id: '0xa1' })
    const ids = await checkV2Status(publicClient, [a])
    expect([...ids]).toEqual(['0xa1'])
    warn.mockRestore()
  })
})

describe('checkFrozenApproval', () => {
  it('returns empty set when no candidates', async () => {
    const ids = await checkFrozenApproval(publicClient, [])
    expect(ids.size).toBe(0)
  })

  it('marks candidates whose getApproved is non-zero', async () => {
    multicallMock.mockResolvedValueOnce([ok(OTHER), ok(zeroAddress)])
    const a = makeClassified({ id: '0xa1', tokenType: 'locked-2ld' })
    const b = makeClassified({ id: '0xb1', tokenType: 'locked-2ld' })
    const ids = await checkFrozenApproval(publicClient, [a, b])
    expect([...ids]).toEqual(['0xa1'])
  })

  it('fails closed: multicall failure is treated as frozen', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    multicallMock.mockResolvedValueOnce([fail()])
    const a = makeClassified({ id: '0xa1', tokenType: 'locked-2ld' })
    const ids = await checkFrozenApproval(publicClient, [a])
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
    const A = makeClassified({ id: '0xa1', tokenType: 'unwrapped', label: 'a' })
    const B = makeClassified({
      id: '0xb1',
      tokenType: 'locked-2ld',
      label: 'b',
      fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_APPROVE,
    })
    const C = makeClassified({ id: '0xc1', tokenType: 'unwrapped', label: 'c' })

    multicallMock.mockResolvedValueOnce([
      ok(OTHER),
      ok([OWNER, 0, 0n] as const),
      ok(OWNER),
    ])
    multicallMock.mockResolvedValueOnce([ok(0), ok(0), ok(0)])
    multicallMock.mockResolvedValueOnce([ok(OTHER)])

    const result = await runEligibilityChecks(publicClient, [A, B, C], OWNER)

    expect(result.alreadyMigrated.map((n) => n.domain.id)).toEqual(['0xa1'])
    expect(result.frozen.map((n) => n.domain.id)).toEqual(['0xb1'])
    expect(result.eligible.map((n) => n.domain.id)).toEqual(['0xc1'])
  })
})

describe('resolveParentRegistries', () => {
  it('returns empty map for empty input and issues no RPC', async () => {
    const result = await resolveParentRegistries(publicClient, new Map())
    expect(result.size).toBe(0)
  })

  it('resolves a single-label parent with one first-hop multicall', async () => {
    const parent: Address = '0x0000000000000000000000000000000000000a01'
    const child = makeClassified({
      tokenType: 'locked-child',
      parentName: 'raffy.eth',
      name: 'sub.raffy.eth',
    })
    multicallMock.mockResolvedValueOnce([ok(parent)])

    const result = await resolveParentRegistries(
      publicClient,
      new Map([['raffy.eth', [child]]]),
    )

    expect(result.get('raffy.eth')).toBe(parent)
    expect(multicallMock).toHaveBeenCalledTimes(1)
  })

  it('walks deep registry for multi-label parents', async () => {
    const firstHop: Address = '0x0000000000000000000000000000000000000b01'
    const deeper: Address = '0x0000000000000000000000000000000000000b02'
    const child = makeClassified({
      tokenType: 'locked-child',
      parentName: 'a.b.eth',
      name: 'x.a.b.eth',
    })

    multicallMock.mockResolvedValueOnce([ok(firstHop)])
    readContractMock.mockResolvedValueOnce(deeper)

    const result = await resolveParentRegistries(
      publicClient,
      new Map([['a.b.eth', [child]]]),
    )
    expect(result.get('a.b.eth')).toBe(deeper)
  })

  it('short-circuits to zeroAddress when first hop is zero', async () => {
    const child = makeClassified({
      tokenType: 'locked-child',
      parentName: 'a.b.eth',
      name: 'x.a.b.eth',
    })
    multicallMock.mockResolvedValue([ok(zeroAddress)])

    vi.useFakeTimers()
    const pending = resolveParentRegistries(
      publicClient,
      new Map([['a.b.eth', [child]]]),
    )
    await vi.runAllTimersAsync()
    const result = await pending
    vi.useRealTimers()

    expect(result.get('a.b.eth')).toBe(zeroAddress)
    expect(multicallMock).toHaveBeenCalledTimes(3)
  })
})
