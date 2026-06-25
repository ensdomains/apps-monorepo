import { type Address, zeroAddress } from 'viem'
import { multicall } from 'viem/actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type ClassifiedName, FUSES, type MigrationTokenType } from './classify'
import {
  checkFrozenApproval,
  checkOwnership,
  runEligibilityChecks,
} from './preflight'
import type { V1Domain } from './types'

vi.mock('viem/actions', () => ({ multicall: vi.fn() }))

const multicallMock = vi.mocked(multicall)

const OWNER: Address = '0x0000000000000000000000000000000000000001'
const OTHER: Address = '0x0000000000000000000000000000000000000002'

const publicClient = {} as never
const ok = <T>(result: T) => ({ status: 'success' as const, result })
const fail = () => ({
  status: 'failure' as const,
  error: new Error('reverted'),
  result: undefined,
})

const makeClassified = (o: {
  id: string
  label?: string
  name?: string
  tokenType?: MigrationTokenType
  fuses?: number
}): ClassifiedName => ({
  tokenType: o.tokenType ?? 'unwrapped',
  label: o.label ?? 'alice',
  parentName: 'eth',
  fuses: o.fuses ?? 0,
  tokenHolder: OWNER,
  v1ResolverAddress: null,
  resolverStrategy: 'to-owned-permres',
  managerAddress: null,
  domain: {
    id: o.id,
    labelhash: o.id,
    name: o.name ?? 'alice.eth',
  } as unknown as V1Domain,
})

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

describe('runEligibilityChecks', () => {
  it('returns empty buckets for empty input and issues no RPC', async () => {
    const result = await runEligibilityChecks(publicClient, [], OWNER)
    expect(result).toEqual({ eligible: [], frozen: [], alreadyMigrated: [] })
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

    const result = await runEligibilityChecks(publicClient, [A, B, C], OWNER)

    expect(result.alreadyMigrated.map((n) => n.domain.id)).toEqual(['0xa1'])
    expect(result.frozen.map((n) => n.domain.id)).toEqual(['0xb1'])
    expect(result.eligible.map((n) => n.domain.id)).toEqual(['0xc1'])
    expect(multicallMock).toHaveBeenCalledTimes(2)
  })
})
