/**
 * Session Actors Tests
 *
 * Tests for the 3 session actor functions:
 * - checkExistingSessionActor
 * - createSessionActor
 * - restoreSessionActor
 */

import {
  buildRegistrationSessionActionsHash,
  SessionError,
} from '@ens-apps/smart-account'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { Address, Chain, Hex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RhinestoneStoredSession } from '../sessions/types'
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

vi.mock('@ens-apps/smart-account', async () => {
  const actual = await vi.importActual<
    typeof import('@ens-apps/smart-account')
  >('@ens-apps/smart-account')
  return {
    ...actual,
    createRhinestoneSession: vi.fn(),
    restoreRhinestoneSession: vi.fn(),
  }
})

import {
  createRhinestoneSession,
  restoreRhinestoneSession,
} from '@ens-apps/smart-account'
import { okAsync } from 'neverthrow'
import {
  getSkippedStatus,
  getValidSessionByOwner,
  saveSession,
} from '../sessions/session-storage'

const mockedGetValidSessionByOwner = vi.mocked(getValidSessionByOwner)
const mockedGetSkippedStatus = vi.mocked(getSkippedStatus)
const mockedSaveSession = vi.mocked(saveSession)
const mockedCreateRhinestoneSession = vi.mocked(createRhinestoneSession)
const mockedRestoreRhinestoneSession = vi.mocked(restoreRhinestoneSession)

// ── Fixtures ───────────────────────────────────────────────────────────

// Real-shaped hex addresses (not placeholder strings) — the package's
// `buildRegistrationSessionActions` now runs `viem.getAddress(...)` on
// the EOA, which rejects non-hex input.
const OWNER_ADDRESS = '0x1111111111111111111111111111111111111111' as Address
const ACCOUNT_ADDRESS = '0x2222222222222222222222222222222222222222' as Address
const SESSION_KEY_ADDRESS =
  '0xSessionKey1234567890123456789012345678901234' as Address
const SESSION_PRIVATE_KEY = '0xdeadbeef1234567890abcdef' as Hex

const MOCK_ENABLE_SIGNATURE = '0xenablesig123' as Hex
const MOCK_HASHES_JSON = JSON.stringify([
  { chainId: '11155111', sessionDigest: '0xdigest123' },
])

/**
 * Hash of the action set for `OWNER_ADDRESS` + the test's fixed
 * `validUntil`. `restoreRhinestoneSession` recomputes this from the
 * stored `ownerAddress` + `validUntil` and rejects on mismatch, so the
 * fixture must carry the real hash.
 */
const VALID_ACTIONS_HASH = buildRegistrationSessionActionsHash({
  eoaAddress: OWNER_ADDRESS,
  validUntil: 2_000_000_000,
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
  enableSignature: MOCK_ENABLE_SIGNATURE,
  hashesAndChainIds: MOCK_HASHES_JSON,
  // Future unix timestamp (2033-05-18) — keep tests deterministic and
  // well clear of any expiry checks.
  validUntil: 2_000_000_000,
  actionsHash: VALID_ACTIONS_HASH,
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
    it('returns session when a valid rhinestone session exists', async () => {
      const session = createMockRhinestoneSession()
      mockedGetValidSessionByOwner.mockReturnValue(session)
      mockedGetSkippedStatus.mockReturnValue(false)

      const result = await checkExistingSessionActor({
        ownerAddress: OWNER_ADDRESS,
      })

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toEqual({
        session,
        wasSkipped: false,
      })
    })

    it('returns null session when stored session is not a rhinestone session', async () => {
      // Simulate a legacy/unknown session shape — any non-rhinestone
      // provider must be discarded so the user is re-prompted to enable a
      // rhinestone session.
      const session = {
        ...createMockRhinestoneSession(),
        provider: 'something-else',
      } as unknown as RhinestoneStoredSession
      mockedGetValidSessionByOwner.mockReturnValue(session)
      mockedGetSkippedStatus.mockReturnValue(false)

      const result = await checkExistingSessionActor({
        ownerAddress: OWNER_ADDRESS,
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
      })

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toEqual({
        session: null,
        wasSkipped: false,
      })
    })
  })

  // ─── createSessionActor ──────────────────────────────────────────

  describe('createSessionActor', () => {
    const mockRhinestoneAccount = {
      experimental_getSessionDetails: vi.fn(),
      experimental_signEnableSession: vi.fn(),
    } as unknown as RhinestoneAccount
    const mockChain = { id: 11155111, name: 'Sepolia' } as unknown as Chain

    it('creates rhinestone session and returns sessionPrivateKey with enableData', async () => {
      const session = createMockRhinestoneSession()
      mockedCreateRhinestoneSession.mockReturnValue(
        okAsync({ session, sessionPrivateKey: SESSION_PRIVATE_KEY }),
      )

      const result = await createSessionActor({
        ownerAddress: OWNER_ADDRESS,
        accountAddress: ACCOUNT_ADDRESS,
        chainId: 11155111,
        rhinestoneAccount: mockRhinestoneAccount,
        chain: mockChain,
      })

      expect(result.isOk()).toBe(true)
      const output = result._unsafeUnwrap()
      expect(output.session).toBe(session)
      expect(output.sessionClient).toEqual({
        sessionPrivateKey: SESSION_PRIVATE_KEY,
        enableSignature: MOCK_ENABLE_SIGNATURE,
        hashesAndChainIds: MOCK_HASHES_JSON,
        ownerAddress: OWNER_ADDRESS,
        validUntil: 2_000_000_000,
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
        chainId: 11155111,
        rhinestoneAccount: mockRhinestoneAccount,
        chain: mockChain,
      })

      expect(mockedSaveSession).toHaveBeenCalledWith(session)
    })
  })

  // ─── restoreSessionActor ─────────────────────────────────────────

  describe('restoreSessionActor', () => {
    it('restores rhinestone session and returns sessionPrivateKey with enableData', async () => {
      const session = createMockRhinestoneSession()
      mockedRestoreRhinestoneSession.mockReturnValue(okAsync(undefined))

      const result = await restoreSessionActor({ session })

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toEqual({
        sessionClient: {
          sessionPrivateKey: SESSION_PRIVATE_KEY,
          enableSignature: MOCK_ENABLE_SIGNATURE,
          hashesAndChainIds: MOCK_HASHES_JSON,
          ownerAddress: OWNER_ADDRESS,
          validUntil: 2_000_000_000,
        },
      })
    })

    it('returns error when given a non-rhinestone session', async () => {
      const session = {
        ...createMockRhinestoneSession(),
        provider: 'something-else',
      } as unknown as RhinestoneStoredSession

      const result = await restoreSessionActor({ session })

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(SessionError)
      expect(result._unsafeUnwrapErr().message).toContain(
        'Session type mismatch: expected Rhinestone session',
      )
    })
  })
})
