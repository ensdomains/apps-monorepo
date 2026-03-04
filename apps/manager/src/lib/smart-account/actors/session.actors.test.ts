/**
 * Session Actors Tests
 *
 * Tests for the 3 session actor functions:
 * - checkExistingSessionActor
 * - createSessionActor
 * - restoreSessionActor
 */

import type { KernelAccountClient } from '@zerodev/sdk'
import type { Address, Hex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  RhinestoneStoredSession,
  ZeroDevStoredSession,
} from '../sessions/types'
import { SessionError } from '../sessions/zerodev-session'
import {
  checkExistingSessionActor,
  createSessionActor,
  restoreSessionActor,
} from './session.actors'

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('../sessions/session-storage', () => ({
  getValidSessionByOwner: vi.fn(),
  getSkippedStatus: vi.fn(),
  saveSession: vi.fn(),
}))

vi.mock('../sessions', () => ({
  createRhinestoneSession: vi.fn(),
  createZeroDevSession: vi.fn(),
  restoreRhinestoneSession: vi.fn(),
  restoreZeroDevSession: vi.fn(),
}))

import { okAsync } from 'neverthrow'
import {
  createRhinestoneSession,
  createZeroDevSession,
  restoreRhinestoneSession,
  restoreZeroDevSession,
} from '../sessions'
import {
  getSkippedStatus,
  getValidSessionByOwner,
  saveSession,
} from '../sessions/session-storage'

const mockedGetValidSessionByOwner = vi.mocked(getValidSessionByOwner)
const mockedGetSkippedStatus = vi.mocked(getSkippedStatus)
const mockedSaveSession = vi.mocked(saveSession)
const mockedCreateRhinestoneSession = vi.mocked(createRhinestoneSession)
const mockedCreateZeroDevSession = vi.mocked(createZeroDevSession)
const mockedRestoreRhinestoneSession = vi.mocked(restoreRhinestoneSession)
const mockedRestoreZeroDevSession = vi.mocked(restoreZeroDevSession)

// ── Fixtures ───────────────────────────────────────────────────────────

const OWNER_ADDRESS = '0xOwner12345678901234567890123456789012345678' as Address
const ACCOUNT_ADDRESS = '0xAccount1234567890123456789012345678901234' as Address
const SESSION_KEY_ADDRESS =
  '0xSessionKey1234567890123456789012345678901234' as Address
const SESSION_PRIVATE_KEY = '0xdeadbeef1234567890abcdef' as Hex

const createMockZeroDevSession = (
  overrides: Partial<ZeroDevStoredSession> = {},
): ZeroDevStoredSession => ({
  id: 'session-zerodev-1',
  provider: 'zerodev',
  sessionKeyAddress: SESSION_KEY_ADDRESS,
  smartAccountAddress: ACCOUNT_ADDRESS,
  ownerAddress: OWNER_ADDRESS,
  createdAt: Date.now(),
  chainId: 11155111,
  sessionPrivateKey: SESSION_PRIVATE_KEY,
  serializedSessionAccount: 'serialized-data',
  ...overrides,
})

const createMockRhinestoneSession = (
  overrides: Partial<RhinestoneStoredSession> = {},
): RhinestoneStoredSession => ({
  id: 'session-rhinestone-1',
  provider: 'rhinestone',
  sessionKeyAddress: SESSION_KEY_ADDRESS,
  smartAccountAddress: ACCOUNT_ADDRESS,
  ownerAddress: OWNER_ADDRESS,
  createdAt: Date.now(),
  chainId: 11155111,
  sessionPrivateKey: SESSION_PRIVATE_KEY,
  sessionConfig: JSON.stringify({ provider: 'rhinestone', chainId: 11155111 }),
  serializedSessionAccount: '',
  ...overrides,
})

// ── Tests ──────────────────────────────────────────────────────────────

describe('session.actors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  // ─── checkExistingSessionActor ───────────────────────────────────

  describe('checkExistingSessionActor', () => {
    it('returns session when valid session exists with matching provider', async () => {
      const session = createMockRhinestoneSession()
      mockedGetValidSessionByOwner.mockReturnValue(session)
      mockedGetSkippedStatus.mockReturnValue(false)

      const result = await checkExistingSessionActor({
        ownerAddress: OWNER_ADDRESS,
        provider: 'rhinestone',
      })

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toEqual({
        session,
        wasSkipped: false,
      })
    })

    it('returns null session when provider mismatches stored session', async () => {
      const session = createMockZeroDevSession()
      mockedGetValidSessionByOwner.mockReturnValue(session)
      mockedGetSkippedStatus.mockReturnValue(false)

      const result = await checkExistingSessionActor({
        ownerAddress: OWNER_ADDRESS,
        provider: 'rhinestone',
      })

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toEqual({
        session: null,
        wasSkipped: false,
      })
    })

    it('returns wasSkipped true when no session but skip status is true', async () => {
      mockedGetValidSessionByOwner.mockReturnValue(null)
      mockedGetSkippedStatus.mockReturnValue(true)

      const result = await checkExistingSessionActor({
        ownerAddress: OWNER_ADDRESS,
        provider: 'rhinestone',
      })

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toEqual({
        session: null,
        wasSkipped: true,
      })
    })

    it('returns null session and wasSkipped false when no session and not skipped', async () => {
      mockedGetValidSessionByOwner.mockReturnValue(null)
      mockedGetSkippedStatus.mockReturnValue(false)

      const result = await checkExistingSessionActor({
        ownerAddress: OWNER_ADDRESS,
        provider: 'zerodev',
      })

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toEqual({
        session: null,
        wasSkipped: false,
      })
    })

    it('treats missing session.provider as zerodev (backwards compat)', async () => {
      const session = createMockZeroDevSession({ provider: undefined })
      mockedGetValidSessionByOwner.mockReturnValue(session)
      mockedGetSkippedStatus.mockReturnValue(false)

      const result = await checkExistingSessionActor({
        ownerAddress: OWNER_ADDRESS,
        provider: 'zerodev',
      })

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap().session).toBe(session)
    })
  })

  // ─── createSessionActor ──────────────────────────────────────────

  describe('createSessionActor', () => {
    it('creates rhinestone session and returns sessionPrivateKey', async () => {
      const session = createMockRhinestoneSession()
      mockedCreateRhinestoneSession.mockReturnValue(
        okAsync({ session, sessionPrivateKey: SESSION_PRIVATE_KEY }),
      )

      const result = await createSessionActor({
        ownerAddress: OWNER_ADDRESS,
        accountAddress: ACCOUNT_ADDRESS,
        provider: 'rhinestone',
        chainId: 11155111,
      })

      expect(result.isOk()).toBe(true)
      const output = result._unsafeUnwrap()
      expect(output.session).toBe(session)
      expect(output.sessionClient).toEqual({
        sessionPrivateKey: SESSION_PRIVATE_KEY,
      })
    })

    it('saves rhinestone session before returning', async () => {
      const session = createMockRhinestoneSession()
      mockedCreateRhinestoneSession.mockReturnValue(
        okAsync({ session, sessionPrivateKey: SESSION_PRIVATE_KEY }),
      )

      await createSessionActor({
        ownerAddress: OWNER_ADDRESS,
        accountAddress: ACCOUNT_ADDRESS,
        provider: 'rhinestone',
        chainId: 11155111,
      })

      expect(mockedSaveSession).toHaveBeenCalledWith(session)
    })

    it('creates zerodev session and returns client', async () => {
      const session = createMockZeroDevSession()
      const mockClient = {
        mock: 'kernel-client',
      } as unknown as KernelAccountClient
      mockedCreateZeroDevSession.mockReturnValue(
        okAsync({ session, client: mockClient }),
      )

      const result = await createSessionActor({
        ownerAddress: OWNER_ADDRESS,
        accountAddress: ACCOUNT_ADDRESS,
        provider: 'zerodev',
        chainId: 11155111,
        ecdsaValidator: {} as any,
        ecdsaValidator: {} as unknown as KernelValidator<'ECDSAValidator'>,

      expect(result.isOk()).toBe(true)
      const output = result._unsafeUnwrap()
      expect(output.session).toBe(session)
      expect(output.sessionClient).toBe(mockClient)
    })

    it('saves zerodev session before returning', async () => {
      const session = createMockZeroDevSession()
      const mockClient = {
        mock: 'kernel-client',
      } as unknown as KernelAccountClient
      mockedCreateZeroDevSession.mockReturnValue(
        okAsync({ session, client: mockClient }),
      )

      await createSessionActor({
        ownerAddress: OWNER_ADDRESS,
        accountAddress: ACCOUNT_ADDRESS,
        provider: 'zerodev',
        chainId: 11155111,
        ecdsaValidator: {} as any,
      })

      expect(mockedSaveSession).toHaveBeenCalledWith(session)
    })

    it('returns error when ecdsaValidator missing for zerodev provider', async () => {
      const result = await createSessionActor({
        ownerAddress: OWNER_ADDRESS,
        accountAddress: ACCOUNT_ADDRESS,
        provider: 'zerodev',
        chainId: 11155111,
      })

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(SessionError)
      expect(result._unsafeUnwrapErr().message).toContain(
        'Missing ECDSA validator',
      )
    })
  })

  // ─── restoreSessionActor ─────────────────────────────────────────

  describe('restoreSessionActor', () => {
    it('restores rhinestone session and returns sessionPrivateKey', async () => {
      const session = createMockRhinestoneSession()
      mockedRestoreRhinestoneSession.mockReturnValue(okAsync(undefined))

      const result = await restoreSessionActor({
        session,
        provider: 'rhinestone',
      })

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toEqual({
        sessionClient: { sessionPrivateKey: SESSION_PRIVATE_KEY },
      })
    })

    it('restores zerodev session and returns client', async () => {
      const session = createMockZeroDevSession()
      const mockClient = {
        mock: 'kernel-client',
      } as unknown as KernelAccountClient
      mockedRestoreZeroDevSession.mockReturnValue(okAsync(mockClient))

      const result = await restoreSessionActor({
        session,
        provider: 'zerodev',
      })

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap().sessionClient).toBe(mockClient)
    })

    it('returns error for rhinestone provider with zerodev session', async () => {
      const session = createMockZeroDevSession()

      const result = await restoreSessionActor({
        session,
        provider: 'rhinestone',
      })

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toContain(
        'Session type mismatch: expected Rhinestone session',
      )
    })

    it('returns error for zerodev provider with rhinestone session', async () => {
      const session = createMockRhinestoneSession()

      const result = await restoreSessionActor({
        session,
        provider: 'zerodev',
      })

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toContain(
        'Session type mismatch: expected ZeroDev session',
      )
    })
  })
})
