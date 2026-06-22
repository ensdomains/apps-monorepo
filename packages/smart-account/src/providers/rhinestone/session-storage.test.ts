/**
 * @vitest-environment happy-dom
 */
import type { Address, Hex } from 'viem'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAllSessions,
  getSession,
  getSessionByOwner,
  getSkippedStatus,
  getValidSession,
  isSessionExpired,
  removeSession,
  removeSessionsByOwner,
  saveSession,
  setSkippedStatus,
} from './session-storage'
import type { RhinestoneStoredSession } from './types'

const HCA_A: Address = '0xaAaA000000000000000000000000000000000001'
const HCA_B: Address = '0xbBbB000000000000000000000000000000000002'
const OWNER: Address = '0x1111111111111111111111111111111111111111'

const NOW_SEC = Math.floor(Date.now() / 1000)

function makeSession(
  overrides: Partial<RhinestoneStoredSession> = {},
): RhinestoneStoredSession {
  return {
    id: crypto.randomUUID(),
    provider: 'rhinestone',
    sessionKeyAddress: '0x9999999999999999999999999999999999999999',
    smartAccountAddress: HCA_A,
    ownerAddress: OWNER,
    createdAt: Date.now(),
    chainId: 11155111,
    validUntil: NOW_SEC + 3600,
    sessionPrivateKey: `0x${'1'.repeat(64)}` as Hex,
    ...overrides,
  }
}

describe('session-storage', () => {
  beforeEach(() => clearAllSessions())

  it('saves and reads back a session by HCA address (case-insensitive)', () => {
    const s = makeSession()
    saveSession(s)
    expect(getSession(HCA_A)?.id).toBe(s.id)
    expect(getSession(HCA_A.toUpperCase() as Address)?.id).toBe(s.id)
  })

  it('looks up by owner EOA', () => {
    const s = makeSession()
    saveSession(s)
    expect(getSessionByOwner(OWNER)?.id).toBe(s.id)
  })

  it('replaces an existing session for the same account', () => {
    const first = makeSession()
    const second = makeSession()
    saveSession(first)
    saveSession(second)
    expect(getSession(HCA_A)?.id).toBe(second.id)
  })

  it('keeps sessions for different accounts independent', () => {
    const a = makeSession({ smartAccountAddress: HCA_A })
    const b = makeSession({ smartAccountAddress: HCA_B })
    saveSession(a)
    saveSession(b)
    expect(getSession(HCA_A)?.id).toBe(a.id)
    expect(getSession(HCA_B)?.id).toBe(b.id)
  })

  it('removes by account and by owner', () => {
    saveSession(makeSession())
    removeSession(HCA_A)
    expect(getSession(HCA_A)).toBeNull()

    saveSession(makeSession())
    removeSessionsByOwner(OWNER)
    expect(getSessionByOwner(OWNER)).toBeNull()
  })

  it('flags expired sessions and evicts them via getValidSession', () => {
    const expired = makeSession({ validUntil: NOW_SEC - 10 })
    expect(isSessionExpired(expired)).toBe(true)
    saveSession(expired)
    // getValidSession should evict and return null
    expect(getValidSession(HCA_A)).toBeNull()
    expect(getSession(HCA_A)).toBeNull()
  })

  it('treats a session within validity as not expired', () => {
    const s = makeSession({ validUntil: NOW_SEC + 3600 })
    expect(isSessionExpired(s)).toBe(false)
    saveSession(s)
    expect(getValidSession(HCA_A)?.id).toBe(s.id)
  })

  it('persists skip status per owner', () => {
    expect(getSkippedStatus(OWNER)).toBe(false)
    setSkippedStatus(OWNER, true)
    expect(getSkippedStatus(OWNER)).toBe(true)
    setSkippedStatus(OWNER, false)
    expect(getSkippedStatus(OWNER)).toBe(false)
  })
})
