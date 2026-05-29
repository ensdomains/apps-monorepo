/**
 * Session Storage Tests
 *
 * Tests for localStorage persistence of Rhinestone smart sessions.
 * Mocks localStorage and window to test browser-specific behavior.
 */

import { type Address, type Hex, zeroHash } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAllSessions,
  getAllSessions,
  getSession,
  getSessionByOwner,
  getValidSession,
  getValidSessionByOwner,
  isSessionExpired,
  removeSession,
  removeSessionsByOwner,
  saveSession,
} from './session-storage'
import type { RhinestoneStoredSession, StoredSession } from './types'

const SESSION_STORAGE_KEY = 'ens-sessions-v6'

const createMockSession = (
  overrides: Partial<RhinestoneStoredSession> = {},
): StoredSession => ({
  id: 'session-123',
  provider: 'rhinestone',
  sessionKeyAddress:
    '0xSessionKey1234567890123456789012345678901234' as Address,
  smartAccountAddress:
    '0xSmartAccount123456789012345678901234567890' as Address,
  ownerAddress: '0xOwner12345678901234567890123456789012345678' as Address,
  createdAt: Date.now(),
  chainId: 11155111,
  sessionPrivateKey: '0xprivatekey123456789' as Hex,
  sessionConfig: '{}',
  enableSignature: '0xenable' as Hex,
  hashesAndChainIds: '[]',
  // Storage tests don't exercise the drift check — any stable hex works.
  actionsHash: zeroHash,
  ...overrides,
})

describe('session-storage', () => {
  let mockLocalStorage: Record<string, string>

  beforeEach(() => {
    mockLocalStorage = {}

    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => mockLocalStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockLocalStorage[key] = value
      }),
      removeItem: vi.fn((key: string) => {
        delete mockLocalStorage[key]
      }),
    })

    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('getAllSessions', () => {
    it('returns empty array when no sessions stored', () => {
      const sessions = getAllSessions()

      expect(sessions).toEqual([])
    })

    it('returns empty array when localStorage has empty string', () => {
      mockLocalStorage[SESSION_STORAGE_KEY] = ''

      const sessions = getAllSessions()

      expect(sessions).toEqual([])
    })

    it('returns stored sessions', () => {
      const storedSessions = [createMockSession()]
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify(storedSessions)

      const sessions = getAllSessions()

      expect(sessions).toHaveLength(1)
      expect(sessions[0]?.id).toBe('session-123')
    })

    it('returns empty array for invalid JSON', () => {
      mockLocalStorage[SESSION_STORAGE_KEY] = 'invalid-json'

      const sessions = getAllSessions()

      expect(sessions).toEqual([])
      expect(console.error).toHaveBeenCalledWith(
        'Failed to parse stored sessions:',
        expect.any(Error),
      )
    })

    it('returns empty array when parsed value is not an array', () => {
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify({
        notAnArray: true,
      })

      const sessions = getAllSessions()

      expect(sessions).toEqual([])
    })

    it('returns empty array when window is undefined', () => {
      vi.stubGlobal('window', undefined)

      const sessions = getAllSessions()

      expect(sessions).toEqual([])
    })
  })

  describe('getSession', () => {
    it('returns null when no session found', () => {
      const session = getSession(
        '0xNonExistent1234567890123456789012345678901234' as Address,
      )

      expect(session).toBeNull()
    })

    it('finds session by exact address', () => {
      const mockSession = createMockSession()
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([mockSession])

      const session = getSession(mockSession.smartAccountAddress)

      expect(session).not.toBeNull()
      expect(session?.id).toBe('session-123')
    })

    it('finds session case-insensitively', () => {
      const mockSession = createMockSession({
        smartAccountAddress:
          '0xABCDEF1234567890123456789012345678901234' as Address,
      })
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([mockSession])

      const session = getSession(
        '0xabcdef1234567890123456789012345678901234' as Address,
      )

      expect(session).not.toBeNull()
      expect(session?.smartAccountAddress).toBe(
        '0xABCDEF1234567890123456789012345678901234',
      )
    })
  })

  describe('getSessionByOwner', () => {
    it('returns null when no session found', () => {
      const session = getSessionByOwner(
        '0xNonExistent1234567890123456789012345678901234' as Address,
      )

      expect(session).toBeNull()
    })

    it('finds session by owner address', () => {
      const mockSession = createMockSession()
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([mockSession])

      const session = getSessionByOwner(mockSession.ownerAddress)

      expect(session).not.toBeNull()
      expect(session?.id).toBe('session-123')
    })

    it('finds session case-insensitively', () => {
      const mockSession = createMockSession({
        ownerAddress: '0xABCDEF1234567890123456789012345678901234' as Address,
      })
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([mockSession])

      const session = getSessionByOwner(
        '0xabcdef1234567890123456789012345678901234' as Address,
      )

      expect(session).not.toBeNull()
    })
  })

  describe('saveSession', () => {
    it('saves a new session', () => {
      const mockSession = createMockSession()

      saveSession(mockSession)

      const stored = JSON.parse(mockLocalStorage[SESSION_STORAGE_KEY] ?? '[]')
      expect(stored).toHaveLength(1)
      expect(stored[0].id).toBe('session-123')
    })

    it('replaces existing session for same account', () => {
      const existingSession = createMockSession({ id: 'old-session' })
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([existingSession])

      const newSession = createMockSession({
        id: 'new-session',
        smartAccountAddress: existingSession.smartAccountAddress,
      })

      saveSession(newSession)

      const stored = JSON.parse(mockLocalStorage[SESSION_STORAGE_KEY])
      expect(stored).toHaveLength(1)
      expect(stored[0].id).toBe('new-session')
    })

    it('preserves other sessions when saving', () => {
      const otherSession = createMockSession({
        id: 'other-session',
        smartAccountAddress:
          '0xOtherAccount12345678901234567890123456789012' as Address,
      })
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([otherSession])

      const newSession = createMockSession({ id: 'new-session' })

      saveSession(newSession)

      const stored = JSON.parse(mockLocalStorage[SESSION_STORAGE_KEY])
      expect(stored).toHaveLength(2)
      expect(stored.map((s: StoredSession) => s.id).sort()).toEqual([
        'new-session',
        'other-session',
      ])
    })

    it('does nothing when window is undefined', () => {
      vi.stubGlobal('window', undefined)
      const mockSession = createMockSession()

      // Should not throw
      saveSession(mockSession)

      expect(mockLocalStorage[SESSION_STORAGE_KEY]).toBeUndefined()
    })

    it('throws error when localStorage fails', () => {
      vi.stubGlobal('localStorage', {
        getItem: () => '[]',
        setItem: () => {
          throw new Error('Storage quota exceeded')
        },
      })

      const mockSession = createMockSession()

      expect(() => saveSession(mockSession)).toThrow(
        'Failed to save session to localStorage',
      )
    })

    it('logs success message on save', () => {
      const mockSession = createMockSession()

      saveSession(mockSession)

      expect(console.log).toHaveBeenCalledWith(
        '✅ Session saved for account:',
        mockSession.smartAccountAddress,
      )
    })
  })

  describe('removeSession', () => {
    it('removes session by account address', () => {
      const mockSession = createMockSession()
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([mockSession])

      removeSession(mockSession.smartAccountAddress)

      const stored = JSON.parse(mockLocalStorage[SESSION_STORAGE_KEY])
      expect(stored).toHaveLength(0)
    })

    it('preserves other sessions when removing', () => {
      const session1 = createMockSession({ id: 'session-1' })
      const session2 = createMockSession({
        id: 'session-2',
        smartAccountAddress:
          '0xOtherAccount12345678901234567890123456789012' as Address,
      })
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([
        session1,
        session2,
      ])

      removeSession(session1.smartAccountAddress)

      const stored = JSON.parse(mockLocalStorage[SESSION_STORAGE_KEY])
      expect(stored).toHaveLength(1)
      expect(stored[0].id).toBe('session-2')
    })

    it('handles case-insensitive address matching', () => {
      const mockSession = createMockSession({
        smartAccountAddress:
          '0xABCDEF1234567890123456789012345678901234' as Address,
      })
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([mockSession])

      removeSession('0xabcdef1234567890123456789012345678901234' as Address)

      const stored = JSON.parse(mockLocalStorage[SESSION_STORAGE_KEY])
      expect(stored).toHaveLength(0)
    })

    it('does nothing when window is undefined', () => {
      vi.stubGlobal('window', undefined)
      const mockSession = createMockSession()
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([mockSession])

      removeSession(mockSession.smartAccountAddress)

      // Storage should remain unchanged
      expect(mockLocalStorage[SESSION_STORAGE_KEY]).toBe(
        JSON.stringify([mockSession]),
      )
    })

    it('logs removal message', () => {
      const mockSession = createMockSession()
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([mockSession])

      removeSession(mockSession.smartAccountAddress)

      expect(console.log).toHaveBeenCalledWith(
        '🗑️ Session removed for account:',
        mockSession.smartAccountAddress,
      )
    })
  })

  describe('removeSessionsByOwner', () => {
    it('removes all sessions for an owner', () => {
      const ownerAddress =
        '0xOwner12345678901234567890123456789012345678' as Address
      const session1 = createMockSession({
        id: 'session-1',
        ownerAddress,
        smartAccountAddress:
          '0xAccount1234567890123456789012345678901234' as Address,
      })
      const session2 = createMockSession({
        id: 'session-2',
        ownerAddress,
        smartAccountAddress:
          '0xAccount2345678901234567890123456789012345' as Address,
      })
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([
        session1,
        session2,
      ])

      removeSessionsByOwner(ownerAddress)

      const stored = JSON.parse(mockLocalStorage[SESSION_STORAGE_KEY])
      expect(stored).toHaveLength(0)
    })

    it('preserves sessions from other owners', () => {
      const session1 = createMockSession({
        id: 'session-1',
        ownerAddress: '0xOwner11234567890123456789012345678901234' as Address,
      })
      const session2 = createMockSession({
        id: 'session-2',
        ownerAddress: '0xOwner21234567890123456789012345678901234' as Address,
        smartAccountAddress:
          '0xOtherAccount12345678901234567890123456789012' as Address,
      })
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([
        session1,
        session2,
      ])

      removeSessionsByOwner(session1.ownerAddress)

      const stored = JSON.parse(mockLocalStorage[SESSION_STORAGE_KEY])
      expect(stored).toHaveLength(1)
      expect(stored[0].id).toBe('session-2')
    })

    it('does nothing when window is undefined', () => {
      vi.stubGlobal('window', undefined)
      const mockSession = createMockSession()
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([mockSession])

      removeSessionsByOwner(mockSession.ownerAddress)

      expect(mockLocalStorage[SESSION_STORAGE_KEY]).toBe(
        JSON.stringify([mockSession]),
      )
    })
  })

  describe('clearAllSessions', () => {
    it('removes all sessions', () => {
      const sessions = [
        createMockSession({ id: 'session-1' }),
        createMockSession({
          id: 'session-2',
          smartAccountAddress:
            '0xOtherAccount12345678901234567890123456789012' as Address,
        }),
      ]
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify(sessions)

      clearAllSessions()

      expect(mockLocalStorage[SESSION_STORAGE_KEY]).toBeUndefined()
    })

    it('does nothing when window is undefined', () => {
      vi.stubGlobal('window', undefined)
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([
        createMockSession(),
      ])

      clearAllSessions()

      expect(mockLocalStorage[SESSION_STORAGE_KEY]).toBeDefined()
    })

    it('logs clear message', () => {
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([
        createMockSession(),
      ])

      clearAllSessions()

      expect(console.log).toHaveBeenCalledWith('🗑️ All sessions cleared')
    })
  })

  describe('isSessionExpired', () => {
    it('returns false when session has no validUntil', () => {
      const session = createMockSession({ validUntil: undefined })

      expect(isSessionExpired(session)).toBe(false)
    })

    it('returns false when session is not expired', () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      const session = createMockSession({ validUntil: futureTimestamp })

      expect(isSessionExpired(session)).toBe(false)
    })

    it('returns true when session is expired', () => {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
      const session = createMockSession({ validUntil: pastTimestamp })

      expect(isSessionExpired(session)).toBe(true)
    })

    it('handles boundary case at exact expiry time', () => {
      // Create a session that expires exactly now
      // Due to timing, we test just past expiry
      const justPast = Math.floor(Date.now() / 1000) - 1
      const session = createMockSession({ validUntil: justPast })

      expect(isSessionExpired(session)).toBe(true)
    })

    it('correctly handles validUntil as unix timestamp (seconds)', () => {
      // validUntil is in seconds, Date.now() is in milliseconds
      const nowSeconds = Math.floor(Date.now() / 1000)
      const futureSeconds = nowSeconds + 60
      const pastSeconds = nowSeconds - 60

      const futureSession = createMockSession({ validUntil: futureSeconds })
      const pastSession = createMockSession({ validUntil: pastSeconds })

      expect(isSessionExpired(futureSession)).toBe(false)
      expect(isSessionExpired(pastSession)).toBe(true)
    })
  })

  describe('getValidSession', () => {
    it('returns null when no session exists', () => {
      const session = getValidSession(
        '0xNonExistent1234567890123456789012345678901234' as Address,
      )

      expect(session).toBeNull()
    })

    it('returns session when valid', () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600
      const mockSession = createMockSession({ validUntil: futureTimestamp })
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([mockSession])

      const session = getValidSession(mockSession.smartAccountAddress)

      expect(session).not.toBeNull()
      expect(session?.id).toBe('session-123')
    })

    it('returns null and removes expired session', () => {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600
      const mockSession = createMockSession({ validUntil: pastTimestamp })
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([mockSession])

      const session = getValidSession(mockSession.smartAccountAddress)

      expect(session).toBeNull()
      // Session should be removed
      const stored = JSON.parse(mockLocalStorage[SESSION_STORAGE_KEY])
      expect(stored).toHaveLength(0)
    })

    it('returns session with no expiry', () => {
      const mockSession = createMockSession({ validUntil: undefined })
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([mockSession])

      const session = getValidSession(mockSession.smartAccountAddress)

      expect(session).not.toBeNull()
    })
  })

  describe('getValidSessionByOwner', () => {
    it('returns null when no session exists', () => {
      const session = getValidSessionByOwner(
        '0xNonExistent1234567890123456789012345678901234' as Address,
      )

      expect(session).toBeNull()
    })

    it('returns session when valid', () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600
      const mockSession = createMockSession({ validUntil: futureTimestamp })
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([mockSession])

      const session = getValidSessionByOwner(mockSession.ownerAddress)

      expect(session).not.toBeNull()
      expect(session?.id).toBe('session-123')
    })

    it('returns null and removes expired session', () => {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600
      const mockSession = createMockSession({ validUntil: pastTimestamp })
      mockLocalStorage[SESSION_STORAGE_KEY] = JSON.stringify([mockSession])

      const session = getValidSessionByOwner(mockSession.ownerAddress)

      expect(session).toBeNull()
      // Session should be removed by smartAccountAddress
      const stored = JSON.parse(mockLocalStorage[SESSION_STORAGE_KEY])
      expect(stored).toHaveLength(0)
    })
  })
})
