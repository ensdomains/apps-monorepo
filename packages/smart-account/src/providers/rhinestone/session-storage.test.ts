/**
 * @vitest-environment happy-dom
 */
import * as fc from 'fast-check'
import type { Address, Hex } from 'viem'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAllSessions,
  getAllSessions,
  getSession,
  getSessionByOwner,
  getSkippedStatus,
  getValidSession,
  getValidSessionForAccount,
  hasRegistrationHeadroom,
  isSessionExpired,
  removeSession,
  removeSessionsByOwner,
  SESSION_REGISTRATION_HEADROOM_SECONDS,
  saveSession,
  setSkippedStatus,
} from './session-storage'
import type { RhinestoneStoredSession } from './types'

const HCA_A: Address = '0xaAaA000000000000000000000000000000000001'
const HCA_B: Address = '0xbBbB000000000000000000000000000000000002'
const OWNER: Address = '0x1111111111111111111111111111111111111111'
const OTHER_OWNER: Address = '0x2222222222222222222222222222222222222222'

const NOW_SEC = Math.floor(Date.now() / 1000)
const SESSION_STORAGE_KEY = 'ens-sessions-v10'

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
    permissionId: `0x${'2'.repeat(64)}` as Hex,
    resolver: '0x3333333333333333333333333333333333333333',
    hcaSessionNonce: '0',
    authorization: `0x${'4'.repeat(130)}` as Hex,
    hashesAndChainIds: [
      { chainId: '11155111', sessionDigest: `0x${'5'.repeat(64)}` as Hex },
    ],
    sessionToEnableIndex: 0,
    ...overrides,
  }
}

type SessionOperation =
  | { readonly type: 'save'; readonly session: RhinestoneStoredSession }
  | { readonly type: 'remove-account'; readonly accountAddress: Address }
  | { readonly type: 'remove-owner'; readonly ownerAddress: Address }
  | { readonly type: 'clear' }

const storedSessionArbitrary: fc.Arbitrary<RhinestoneStoredSession> = fc
  .record({
    id: fc.uuid(),
    smartAccountAddress: fc.constantFrom(HCA_A, HCA_B),
    ownerAddress: fc.constantFrom(OWNER, OTHER_OWNER),
    chainId: fc.constantFrom(1, 11155111),
  })
  .map((overrides) => makeSession(overrides))

const sessionOperationArbitrary: fc.Arbitrary<SessionOperation> = fc.oneof(
  storedSessionArbitrary.map((session) => ({
    type: 'save' as const,
    session,
  })),
  fc.constantFrom(HCA_A, HCA_B).map((accountAddress) => ({
    type: 'remove-account' as const,
    accountAddress,
  })),
  fc.constantFrom(OWNER, OTHER_OWNER).map((ownerAddress) => ({
    type: 'remove-owner' as const,
    ownerAddress,
  })),
  fc.constant({ type: 'clear' as const }),
)

const applyOperationToModel = (
  sessions: readonly RhinestoneStoredSession[],
  operation: SessionOperation,
): readonly RhinestoneStoredSession[] => {
  switch (operation.type) {
    case 'save':
      return [
        ...sessions.filter(
          (session) =>
            session.smartAccountAddress.toLowerCase() !==
            operation.session.smartAccountAddress.toLowerCase(),
        ),
        operation.session,
      ]
    case 'remove-account':
      return sessions.filter(
        (session) =>
          session.smartAccountAddress.toLowerCase() !==
          operation.accountAddress.toLowerCase(),
      )
    case 'remove-owner':
      return sessions.filter(
        (session) =>
          session.ownerAddress.toLowerCase() !==
          operation.ownerAddress.toLowerCase(),
      )
    case 'clear':
      return []
  }
}

const applyOperationToStorage = (operation: SessionOperation): void => {
  switch (operation.type) {
    case 'save':
      saveSession(operation.session)
      return
    case 'remove-account':
      removeSession(operation.accountAddress)
      return
    case 'remove-owner':
      removeSessionsByOwner(operation.ownerAddress)
      return
    case 'clear':
      clearAllSessions()
  }
}

describe('session-storage', () => {
  beforeEach(() => {
    clearAllSessions()
    localStorage.removeItem('ens-sessions-v7')
  })

  it('ignores sessions authorized against the pre-remediation v7 manifest', () => {
    localStorage.setItem('ens-sessions-v7', JSON.stringify([makeSession()]))
    expect(getAllSessions()).toEqual([])
  })

  it('saves and reads back a session by HCA address (case-insensitive)', () => {
    const s = makeSession()
    saveSession(s)
    expect(getSession(HCA_A)?.id).toBe(s.id)
    expect(getSession(HCA_A.toUpperCase() as Address)?.id).toBe(s.id)
  })

  it('ignores generated malformed session rows', () => {
    fc.assert(
      fc.property(
        fc.array(fc.jsonValue(), { minLength: 1, maxLength: 8 }),
        (rows) => {
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(rows))

          expect(getAllSessions()).toEqual([])
          expect(getSession(HCA_A)).toBeNull()
        },
      ),
    )
  })

  it('keeps a valid session among generated malformed rows', () => {
    fc.assert(
      fc.property(
        fc.array(fc.jsonValue(), { maxLength: 4 }),
        fc.array(fc.jsonValue(), { maxLength: 4 }),
        (before, after) => {
          const session = makeSession()
          localStorage.setItem(
            SESSION_STORAGE_KEY,
            JSON.stringify([...before, session, ...after]),
          )

          expect(getAllSessions()).toEqual([session])
        },
      ),
    )
  })

  it('matches an immutable model across generated operation sequences', () => {
    fc.assert(
      fc.property(
        fc.array(sessionOperationArbitrary, { minLength: 1, maxLength: 40 }),
        (operations) => {
          clearAllSessions()

          operations.reduce<readonly RhinestoneStoredSession[]>(
            (model, operation) => {
              applyOperationToStorage(operation)
              const nextModel = applyOperationToModel(model, operation)

              expect(getAllSessions()).toEqual(nextModel)
              return nextModel
            },
            [],
          )
        },
      ),
    )
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

  describe('hasRegistrationHeadroom', () => {
    it('rejects a session that would die during the commitment cooldown', () => {
      // Not expired, so still usable by an IN-FLIGHT registration — but too
      // short to start a new one, whose reveal runs after MIN_COMMITMENT_AGE.
      const s = makeSession({ validUntil: NOW_SEC + 120 })
      expect(isSessionExpired(s)).toBe(false)
      expect(hasRegistrationHeadroom(s)).toBe(false)
    })

    it('accepts a session with more than the required headroom', () => {
      const s = makeSession({
        validUntil: NOW_SEC + SESSION_REGISTRATION_HEADROOM_SECONDS + 60,
      })
      expect(hasRegistrationHeadroom(s)).toBe(true)
    })

    it('never evicts — an in-flight registration keeps its session', () => {
      const s = makeSession({ validUntil: NOW_SEC + 120 })
      saveSession(s)
      expect(hasRegistrationHeadroom(s)).toBe(false)
      // Still readable: dropping it here would leave a pending reveal unsignable.
      expect(getValidSession(HCA_A)?.id).toBe(s.id)
    })

    it('treats a session with no validUntil as non-expiring', () => {
      expect(hasRegistrationHeadroom(makeSession({ validUntil: 0 }))).toBe(true)
    })
  })

  it('persists skip status per owner', () => {
    expect(getSkippedStatus(OWNER)).toBe(false)
    setSkippedStatus(OWNER, true)
    expect(getSkippedStatus(OWNER)).toBe(true)
    setSkippedStatus(OWNER, false)
    expect(getSkippedStatus(OWNER)).toBe(false)
  })

  describe('getValidSessionForAccount (owner + chain scoped reuse)', () => {
    const CHAIN_ID = 11155111
    it('returns the session when account, owner and chain all match', () => {
      const s = makeSession({ chainId: CHAIN_ID })
      saveSession(s)
      expect(
        getValidSessionForAccount({
          accountAddress: HCA_A,
          ownerAddress: OWNER,
          chainId: CHAIN_ID,
        })?.id,
      ).toBe(s.id)
    })

    it('evicts and returns null when the owner does not match', () => {
      saveSession(makeSession({ chainId: CHAIN_ID }))
      expect(
        getValidSessionForAccount({
          accountAddress: HCA_A,
          ownerAddress: OTHER_OWNER,
          chainId: CHAIN_ID,
        }),
      ).toBeNull()
      // stale row evicted so the caller creates fresh
      expect(getSession(HCA_A)).toBeNull()
    })

    it('evicts and returns null when the chain does not match', () => {
      saveSession(makeSession({ chainId: CHAIN_ID }))
      expect(
        getValidSessionForAccount({
          accountAddress: HCA_A,
          ownerAddress: OWNER,
          chainId: 1,
        }),
      ).toBeNull()
      expect(getSession(HCA_A)).toBeNull()
    })

    it('returns null (and evicts) for an expired session', () => {
      saveSession(makeSession({ chainId: CHAIN_ID, validUntil: NOW_SEC - 10 }))
      expect(
        getValidSessionForAccount({
          accountAddress: HCA_A,
          ownerAddress: OWNER,
          chainId: CHAIN_ID,
        }),
      ).toBeNull()
      expect(getSession(HCA_A)).toBeNull()
    })

    it('does not reuse a session stored under a different account', () => {
      // Same owner, but the session was created for HCA_A; looking up HCA_B
      // must not return it.
      saveSession(
        makeSession({ smartAccountAddress: HCA_A, chainId: CHAIN_ID }),
      )
      expect(
        getValidSessionForAccount({
          accountAddress: HCA_B,
          ownerAddress: OWNER,
          chainId: CHAIN_ID,
        }),
      ).toBeNull()
      // HCA_A's row is untouched (mismatch eviction only targets the looked-up
      // account)
      expect(getSession(HCA_A)).not.toBeNull()
    })
  })
})
