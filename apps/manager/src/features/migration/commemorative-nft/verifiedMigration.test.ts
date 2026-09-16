import { QueryClient, QueryObserver, skipToken } from '@tanstack/react-query'
import { type Address, getAddress, zeroAddress } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getVerifiedNftMigrationCount,
  recordVerifiedNftMigration,
  type VerifiedNftMigration,
  verifiedNftMigrationQueryOptions,
} from './verifiedMigration'

const ownerAddress = '0xabcdef0123456789abcdef0123456789abcdef01' as Address
const hcaAddress = '0x0000000000000000000000000000000000000002' as Address
const scope = { ownerAddress, hcaAddress, chainId: 11155111 }
const evidence: VerifiedNftMigration = {
  ...scope,
  completedOperations: [{ name: 'alice.eth', action: 'migrate' }],
}
let queryClient: QueryClient

beforeEach(() => {
  queryClient = new QueryClient()
})

afterEach(() => {
  queryClient.clear()
  vi.useRealTimers()
})

const cachedEvidence = (requestedScope = scope) =>
  queryClient.getQueryData(
    verifiedNftMigrationQueryOptions(requestedScope).queryKey,
  )

describe('verified NFT migration evidence', () => {
  it('counts no evidence and empty completed operations as zero', () => {
    expect(getVerifiedNftMigrationCount(undefined, scope)).toBe(0)
    expect(
      getVerifiedNftMigrationCount(
        { ...evidence, completedOperations: [] },
        scope,
      ),
    ).toBe(0)
  })

  it('counts distinct verified operations for the exact scope', () => {
    expect(
      getVerifiedNftMigrationCount(
        {
          ...evidence,
          ownerAddress: getAddress(ownerAddress),
          completedOperations: [
            { name: 'alice.eth', action: 'migrate' },
            { name: 'ALICE.eth', action: 'migrate' },
            { name: 'sub.alice.eth', action: 'copy' },
          ],
        },
        scope,
      ),
    ).toBe(2)
  })

  it.each([
    { ownerAddress: '0x0000000000000000000000000000000000000003' as Address },
    { hcaAddress: '0x0000000000000000000000000000000000000004' as Address },
    { chainId: 1 },
  ])('isolates evidence from another scope: %j', (change) => {
    recordVerifiedNftMigration({ queryClient, evidence })
    expect(
      getVerifiedNftMigrationCount(evidence, { ...scope, ...change }),
    ).toBe(0)
    expect(cachedEvidence({ ...scope, ...change })).toBeUndefined()
  })

  it.each([
    { ownerAddress: zeroAddress },
    { hcaAddress: zeroAddress },
    { ownerAddress: 'not-an-address' as Address },
    { chainId: 0 },
    { chainId: Number.NaN },
  ])('rejects invalid scope: %j', (change) => {
    const invalid = { ...evidence, ...change }
    expect(getVerifiedNftMigrationCount(invalid, invalid)).toBe(0)
    expect(() =>
      recordVerifiedNftMigration({ queryClient, evidence: invalid }),
    ).toThrow('invalid or empty')
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it.each([
    { operations: [] },
    { operations: [{ name: '', action: 'migrate' }] },
    { operations: [{ name: ' alice.eth', action: 'migrate' }] },
    {
      operations: [
        { name: 'alice.eth', action: 'migrate' },
        { name: 'ALICE.eth', action: 'copy' },
      ],
    },
  ] as const)('rejects invalid completed operations: %j', ({ operations }) => {
    const invalid = {
      ...evidence,
      completedOperations: operations,
    }
    expect(getVerifiedNftMigrationCount(invalid, scope)).toBe(0)
    expect(() =>
      recordVerifiedNftMigration({ queryClient, evidence: invalid }),
    ).toThrow('invalid or empty')
    expect(cachedEvidence()).toBeUndefined()
  })

  it('rejects an operation with an invalid runtime action', () => {
    const invalid: VerifiedNftMigration = {
      ...evidence,
      completedOperations: [
        {
          name: 'alice.eth',
          // @ts-expect-error Exercise validation of malformed runtime evidence.
          action: 'unknown',
        },
      ],
    }
    expect(getVerifiedNftMigrationCount(invalid, scope)).toBe(0)
    expect(() =>
      recordVerifiedNftMigration({ queryClient, evidence: invalid }),
    ).toThrow('invalid or empty')
    expect(cachedEvidence()).toBeUndefined()
  })

  it('merges verified runs without modifying prior evidence or caller objects', () => {
    const originalOperation = { name: 'ALICE.eth', action: 'migrate' as const }
    const operations = [originalOperation]
    recordVerifiedNftMigration({
      queryClient,
      evidence: { ...evidence, completedOperations: operations },
    })
    const previous = cachedEvidence()
    originalOperation.name = 'changed.eth'
    operations.push({ name: 'unverified.eth', action: 'migrate' })

    recordVerifiedNftMigration({
      queryClient,
      evidence: {
        ...evidence,
        completedOperations: [
          { name: 'alice.eth', action: 'migrate' },
          { name: 'sub.alice.eth', action: 'copy' },
        ],
      },
    })

    expect(previous?.completedOperations).toEqual([
      { name: 'alice.eth', action: 'migrate' },
    ])
    expect(cachedEvidence()?.completedOperations).toEqual([
      { name: 'alice.eth', action: 'migrate' },
      { name: 'sub.alice.eth', action: 'copy' },
    ])
    expect(Object.isFrozen(cachedEvidence())).toBe(true)
    expect(Object.isFrozen(cachedEvidence()?.completedOperations)).toBe(true)
    expect(Object.isFrozen(cachedEvidence()?.completedOperations[0])).toBe(true)
  })

  it('rejects conflicting runs and preserves the previous verified evidence', () => {
    recordVerifiedNftMigration({ queryClient, evidence })
    const previous = cachedEvidence()
    expect(() =>
      recordVerifiedNftMigration({
        queryClient,
        evidence: {
          ...evidence,
          completedOperations: [{ name: 'alice.eth', action: 'copy' }],
        },
      }),
    ).toThrow('operations conflict')
    expect(cachedEvidence()).toBe(previous)
  })

  it('uses a disabled migration-scoped query with no network fetch', async () => {
    const options = verifiedNftMigrationQueryOptions(scope)
    expect(options.queryFn).toBe(skipToken)
    expect(options.enabled).toBe(false)
    expect(options.staleTime).toBe(Number.POSITIVE_INFINITY)
    expect(options.gcTime).toBe(Number.POSITIVE_INFINITY)
    expect(options.queryKey[0]).toMatchObject({ $scope: 'migration' })
    expect(
      verifiedNftMigrationQueryOptions({
        ...scope,
        ownerAddress: getAddress(ownerAddress),
      }).queryKey,
    ).toEqual(options.queryKey)

    recordVerifiedNftMigration({ queryClient, evidence })
    const observer = new QueryObserver(queryClient, options)
    const unsubscribe = observer.subscribe(() => undefined)
    await queryClient.invalidateQueries({ queryKey: options.queryKey })
    expect(observer.getCurrentResult().data).toEqual(evidence)
    expect(observer.getCurrentResult().fetchStatus).toBe('idle')
    unsubscribe()
  })

  it('keeps evidence for this QueryClient even when recorded before any observer', () => {
    vi.useFakeTimers()
    recordVerifiedNftMigration({ queryClient, evidence })
    vi.advanceTimersByTime(60 * 60 * 1_000)
    expect(cachedEvidence()).toEqual(evidence)
    const anotherClient = new QueryClient()
    expect(
      anotherClient.getQueryData(
        verifiedNftMigrationQueryOptions(scope).queryKey,
      ),
    ).toBeUndefined()
    anotherClient.clear()
  })
})
