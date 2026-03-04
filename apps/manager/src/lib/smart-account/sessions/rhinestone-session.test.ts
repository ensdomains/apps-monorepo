/**
 * Rhinestone Session Tests
 *
 * Tests for createRhinestoneSession and restoreRhinestoneSession.
 */

import type { Address, Hex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRhinestoneSession,
  restoreRhinestoneSession,
} from './rhinestone-session'
import type { RhinestoneStoredSession } from './types'
import { SessionError } from './zerodev-session'

// ── Mocks ──────────────────────────────────────────────────────────────

const MOCK_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex
const MOCK_SESSION_ADDRESS =
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address

vi.mock('viem/accounts', () => ({
  generatePrivateKey: vi.fn(() => MOCK_PRIVATE_KEY),
  privateKeyToAccount: vi.fn(() => ({ address: MOCK_SESSION_ADDRESS })),
}))

const MOCK_UUID = '550e8400-e29b-41d4-a716-446655440000'

// ── Fixtures ───────────────────────────────────────────────────────────

const OWNER_ADDRESS = '0xOwner12345678901234567890123456789012345678' as Address
const ACCOUNT_ADDRESS = '0xAccount1234567890123456789012345678901234' as Address

// ── Tests ──────────────────────────────────────────────────────────────

describe('rhinestone-session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(MOCK_UUID)
  })

  // ─── createRhinestoneSession ─────────────────────────────────────

  describe('createRhinestoneSession', () => {
    it('creates a session with correct shape', async () => {
      const result = await createRhinestoneSession({
        ownerAddress: OWNER_ADDRESS,
        smartAccountAddress: ACCOUNT_ADDRESS,
        chainId: 11155111,
      })

      expect(result.isOk()).toBe(true)
      const { session } = result._unsafeUnwrap()

      expect(session.id).toBe(MOCK_UUID)
      expect(session.provider).toBe('rhinestone')
      expect(session.sessionKeyAddress).toBe(MOCK_SESSION_ADDRESS)
      expect(session.smartAccountAddress).toBe(ACCOUNT_ADDRESS)
      expect(session.ownerAddress).toBe(OWNER_ADDRESS)
      expect(session.chainId).toBe(11155111)
      expect(session.serializedSessionAccount).toBe('')
    })

    it('returns sessionPrivateKey matching the generated key', async () => {
      const result = await createRhinestoneSession({
        ownerAddress: OWNER_ADDRESS,
        smartAccountAddress: ACCOUNT_ADDRESS,
        chainId: 11155111,
      })

      expect(result.isOk()).toBe(true)
      const { session, sessionPrivateKey } = result._unsafeUnwrap()

      expect(sessionPrivateKey).toBe(MOCK_PRIVATE_KEY)
      expect(session.sessionPrivateKey).toBe(MOCK_PRIVATE_KEY)
    })

    it('stores serializable metadata in sessionConfig', async () => {
      const result = await createRhinestoneSession({
        ownerAddress: OWNER_ADDRESS,
        smartAccountAddress: ACCOUNT_ADDRESS,
        chainId: 11155111,
      })

      const { session } = result._unsafeUnwrap()
      const parsed = JSON.parse(session.sessionConfig)

      expect(parsed).toEqual({ provider: 'rhinestone', chainId: 11155111 })
    })

    it('respects config.validUntil when provided', async () => {
      const validUntil = Date.now() + 3600_000

      const result = await createRhinestoneSession({
        ownerAddress: OWNER_ADDRESS,
        smartAccountAddress: ACCOUNT_ADDRESS,
        chainId: 11155111,
        config: { validUntil },
      })

      const { session } = result._unsafeUnwrap()

      expect(session.validUntil).toBe(validUntil)
    })

    it('sets validUntil to undefined when config not provided', async () => {
      const result = await createRhinestoneSession({
        ownerAddress: OWNER_ADDRESS,
        smartAccountAddress: ACCOUNT_ADDRESS,
        chainId: 11155111,
      })

      const { session } = result._unsafeUnwrap()

      expect(session.validUntil).toBeUndefined()
    })
  })

  // ─── restoreRhinestoneSession ────────────────────────────────────

  describe('restoreRhinestoneSession', () => {
    const createSession = (
      overrides: Partial<RhinestoneStoredSession> = {},
    ): RhinestoneStoredSession => ({
      id: 'session-1',
      provider: 'rhinestone',
      sessionKeyAddress: MOCK_SESSION_ADDRESS,
      smartAccountAddress: ACCOUNT_ADDRESS,
      ownerAddress: OWNER_ADDRESS,
      createdAt: Date.now(),
      chainId: 11155111,
      sessionPrivateKey: MOCK_PRIVATE_KEY,
      sessionConfig: JSON.stringify({
        provider: 'rhinestone',
        chainId: 11155111,
      }),
      serializedSessionAccount: '',
      ...overrides,
    })

    it('succeeds for session without validUntil', async () => {
      const session = createSession({ validUntil: undefined })

      const result = await restoreRhinestoneSession({ session })

      expect(result.isOk()).toBe(true)
    })

    it('succeeds for session with future validUntil', async () => {
      const session = createSession({ validUntil: Date.now() + 3600_000 })

      const result = await restoreRhinestoneSession({ session })

      expect(result.isOk()).toBe(true)
    })

    it('returns SessionError for expired session', async () => {
      const session = createSession({ validUntil: Date.now() - 3600_000 })

      const result = await restoreRhinestoneSession({ session })

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(SessionError)
      expect(result._unsafeUnwrapErr().message).toContain('Session has expired')
    })

    it('returns void on success (no sessionConfig)', async () => {
      const session = createSession()

      const result = await restoreRhinestoneSession({ session })

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toBeUndefined()
    })
  })
})
