import { Storage } from 'happy-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeCommemorativeNftClaim } from './contract'
import {
  assertPendingNftClaimStorageReady,
  clearPendingNftClaim,
  isPendingNftClaim,
  type PendingNftClaim,
  readPendingNftClaim,
  savePendingNftClaim,
} from './pendingClaim'

const claim: PendingNftClaim = {
  version: 1,
  chainId: 11155111,
  ownerAddress: '0x1111111111111111111111111111111111111111',
  contractAddress: '0x2222222222222222222222222222222222222222',
  hash: `0x${'a'.repeat(64)}`,
  expectedClaimData: encodeCommemorativeNftClaim([`0x${'b'.repeat(64)}`]),
  submittedAt: 1,
}
beforeEach(() => vi.stubGlobal('localStorage', new Storage()))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('pending commemorative NFT claim storage', () => {
  it('persists an immutable owner, chain, and contract scoped claim across reload', () => {
    savePendingNftClaim(claim)
    const key = localStorage.key(0)
    if (!key) throw new Error('Missing persisted claim')
    const serialized = localStorage.getItem(key)
    if (!serialized) throw new Error('Missing persisted data')
    const reloadedStorage = new Storage()
    reloadedStorage.setItem(key, serialized)
    vi.stubGlobal('localStorage', reloadedStorage)
    expect(readPendingNftClaim(claim)).toEqual({ status: 'pending', claim })
    expect(readPendingNftClaim({ ...claim, chainId: 1 }).status).toBe('empty')
    expect(
      readPendingNftClaim({ ...claim, ownerAddress: claim.contractAddress })
        .status,
    ).toBe('empty')
    expect(
      readPendingNftClaim({ ...claim, contractAddress: claim.ownerAddress })
        .status,
    ).toBe('empty')
    expect(() => assertPendingNftClaimStorageReady(claim)).toThrow()
  })
  it.each([
    { version: 2 },
    { chainId: 1 },
    { hash: '0xabc' },
    { expectedClaimData: '0x' },
    { expectedClaimData: encodeCommemorativeNftClaim([]) },
    { submittedAt: Number.NaN },
    { ownerAddress: '0x0000000000000000000000000000000000000000' },
  ])('rejects malformed persisted data %s', (invalid) => {
    expect(isPendingNftClaim({ ...claim, ...invalid }, claim)).toBe(false)
  })
  it('fails closed on corrupt or unavailable storage', () => {
    savePendingNftClaim(claim)
    const key = localStorage.key(0)
    if (!key) throw new Error('Missing persisted claim')
    const storage = new Storage()
    storage.setItem(key, '{corrupt')
    vi.stubGlobal('localStorage', storage)
    expect(readPendingNftClaim(claim).status).toBe('unavailable')
    expect(() => assertPendingNftClaimStorageReady(claim)).toThrow()
    vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw new Error('Unavailable')
    })
    expect(readPendingNftClaim(claim).status).toBe('unavailable')
  })
  it('checks write permission before a wallet request', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Quota')
    })
    expect(() => assertPendingNftClaimStorageReady(claim)).toThrow()
  })
  it('retains a broadcast hash in memory if storage fills after submission', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Quota')
    })
    expect(() => savePendingNftClaim(claim)).toThrow()
    expect(readPendingNftClaim(claim).claim).toEqual(claim)
    expect(() => assertPendingNftClaimStorageReady(claim)).toThrow()
  })
  it('updates a replacement hash and does not clear it with an obsolete callback', () => {
    savePendingNftClaim(claim)
    const replacement = { ...claim, hash: `0x${'c'.repeat(64)}` as const }
    savePendingNftClaim(replacement)
    clearPendingNftClaim(claim)
    expect(readPendingNftClaim(claim).claim).toEqual(replacement)
    clearPendingNftClaim(replacement)
    expect(readPendingNftClaim(claim).status).toBe('empty')
  })
  it('does not overwrite a newer replacement with an older timed-out check', () => {
    savePendingNftClaim(claim)
    const replacement = { ...claim, hash: `0x${'c'.repeat(64)}` as const }
    savePendingNftClaim(replacement, { previousHash: claim.hash })
    savePendingNftClaim(claim, { previousHash: claim.hash })
    expect(readPendingNftClaim(claim).claim).toEqual(replacement)
  })
})
