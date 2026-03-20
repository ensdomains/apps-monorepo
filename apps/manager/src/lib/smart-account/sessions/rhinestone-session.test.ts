/**
 * Rhinestone Session Tests
 *
 * Tests for createRhinestoneSession and restoreRhinestoneSession.
 */

import type { RhinestoneAccount } from '@rhinestone/sdk'
import { experimental_enableSession } from '@rhinestone/sdk/actions/smart-sessions'
import type { Address, Chain, Hex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@rhinestone/sdk/actions/smart-sessions', () => ({
  experimental_enableSession: vi.fn(() => ({
    resolve: async () => ({
      to: '0x0000000000000000000000000000000000000002' as Address,
      data: '0x' as Hex,
      value: 0n,
    }),
  })),
}))

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

const MOCK_ENABLE_SIGNATURE = '0xenablesig123' as Hex
const MOCK_HASHES_AND_CHAIN_IDS = [
  { chainId: 11155111n, sessionDigest: '0xdigest123' as Hex },
]

// ── Fixtures ───────────────────────────────────────────────────────────

const OWNER_ADDRESS = '0xOwner12345678901234567890123456789012345678' as Address
const ACCOUNT_ADDRESS = '0xAccount1234567890123456789012345678901234' as Address

const MOCK_CHAIN = { id: 11155111, name: 'Sepolia' } as Chain

function createMockRhinestoneAccount(): RhinestoneAccount {
  return {
    experimental_getSessionDetails: vi.fn().mockResolvedValue({
      nonces: [0n],
      hashesAndChainIds: MOCK_HASHES_AND_CHAIN_IDS,
      data: {},
    }),
    experimental_signEnableSession: vi
      .fn()
      .mockResolvedValue(MOCK_ENABLE_SIGNATURE),
    experimental_isSessionEnabled: vi.fn().mockResolvedValue(false),
    sendTransaction: vi.fn().mockResolvedValue('mock-enable-tx'),
    waitForExecution: vi.fn().mockResolvedValue({ fill: { hash: '0x01' } }),
  } as unknown as RhinestoneAccount
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('rhinestone-session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(MOCK_UUID)
  })

  // ─── createRhinestoneSession ─────────────────────────────────────

  describe('createRhinestoneSession', () => {
    it('creates a session with correct shape including enablement data', async () => {
      const mockAccount = createMockRhinestoneAccount()

      const result = await createRhinestoneSession({
        ownerAddress: OWNER_ADDRESS,
        smartAccountAddress: ACCOUNT_ADDRESS,
        chainId: 11155111,
        rhinestoneAccount: mockAccount,
        chain: MOCK_CHAIN,
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
      expect(session.enableSignature).toBe(MOCK_ENABLE_SIGNATURE)
      expect(session.hashesAndChainIds).toBeDefined()
    })

    it('returns sessionPrivateKey matching the generated key', async () => {
      const mockAccount = createMockRhinestoneAccount()

      const result = await createRhinestoneSession({
        ownerAddress: OWNER_ADDRESS,
        smartAccountAddress: ACCOUNT_ADDRESS,
        chainId: 11155111,
        rhinestoneAccount: mockAccount,
        chain: MOCK_CHAIN,
      })

      expect(result.isOk()).toBe(true)
      const { session, sessionPrivateKey } = result._unsafeUnwrap()

      expect(sessionPrivateKey).toBe(MOCK_PRIVATE_KEY)
      expect(session.sessionPrivateKey).toBe(MOCK_PRIVATE_KEY)
    })

    it('calls experimental_getSessionDetails with session containing sudo policy', async () => {
      const mockAccount = createMockRhinestoneAccount()

      await createRhinestoneSession({
        ownerAddress: OWNER_ADDRESS,
        smartAccountAddress: ACCOUNT_ADDRESS,
        chainId: 11155111,
        rhinestoneAccount: mockAccount,
        chain: MOCK_CHAIN,
      })

      expect(mockAccount.experimental_getSessionDetails).toHaveBeenCalledWith([
        expect.objectContaining({
          owners: {
            type: 'ecdsa',
            accounts: [{ address: MOCK_SESSION_ADDRESS }],
          },
          chain: MOCK_CHAIN,
          actions: [{ policies: [{ type: 'sudo' }] }],
        }),
      ])
    })

    it('calls experimental_signEnableSession with session details', async () => {
      const mockAccount = createMockRhinestoneAccount()
      const mockDetails = {
        nonces: [0n],
        hashesAndChainIds: MOCK_HASHES_AND_CHAIN_IDS,
        data: {},
      }
      ;(
        mockAccount.experimental_getSessionDetails as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockDetails)

      await createRhinestoneSession({
        ownerAddress: OWNER_ADDRESS,
        smartAccountAddress: ACCOUNT_ADDRESS,
        chainId: 11155111,
        rhinestoneAccount: mockAccount,
        chain: MOCK_CHAIN,
      })

      expect(mockAccount.experimental_signEnableSession).toHaveBeenCalledWith(
        mockDetails,
      )
    })

    it('submits on-chain enable via experimental_enableSession + sendTransaction', async () => {
      const mockAccount = createMockRhinestoneAccount()

      await createRhinestoneSession({
        ownerAddress: OWNER_ADDRESS,
        smartAccountAddress: ACCOUNT_ADDRESS,
        chainId: 11155111,
        rhinestoneAccount: mockAccount,
        chain: MOCK_CHAIN,
      })

      expect(experimental_enableSession).toHaveBeenCalledWith(
        expect.objectContaining({
          owners: {
            type: 'ecdsa',
            accounts: [{ address: MOCK_SESSION_ADDRESS }],
          },
          chain: MOCK_CHAIN,
        }),
        MOCK_ENABLE_SIGNATURE,
        MOCK_HASHES_AND_CHAIN_IDS,
        0,
      )
      expect(mockAccount.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: MOCK_CHAIN,
          sponsored: true,
          calls: expect.any(Array),
        }),
      )
      expect(mockAccount.waitForExecution).toHaveBeenCalledWith(
        'mock-enable-tx',
        false,
      )
    })

    it('skips sendTransaction when experimental_isSessionEnabled is true', async () => {
      vi.mocked(experimental_enableSession).mockClear()
      const mockAccount = createMockRhinestoneAccount()
      ;(
        mockAccount.experimental_isSessionEnabled as ReturnType<typeof vi.fn>
      ).mockResolvedValue(true)

      await createRhinestoneSession({
        ownerAddress: OWNER_ADDRESS,
        smartAccountAddress: ACCOUNT_ADDRESS,
        chainId: 11155111,
        rhinestoneAccount: mockAccount,
        chain: MOCK_CHAIN,
      })

      expect(mockAccount.sendTransaction).not.toHaveBeenCalled()
      expect(mockAccount.waitForExecution).not.toHaveBeenCalled()
      expect(experimental_enableSession).not.toHaveBeenCalled()
    })

    it('serializes hashesAndChainIds with string chainId for JSON storage', async () => {
      const mockAccount = createMockRhinestoneAccount()

      const result = await createRhinestoneSession({
        ownerAddress: OWNER_ADDRESS,
        smartAccountAddress: ACCOUNT_ADDRESS,
        chainId: 11155111,
        rhinestoneAccount: mockAccount,
        chain: MOCK_CHAIN,
      })

      const { session } = result._unsafeUnwrap()
      const parsed = JSON.parse(session.hashesAndChainIds)

      expect(parsed).toEqual([
        { chainId: '11155111', sessionDigest: '0xdigest123' },
      ])
    })

    it('stores serializable metadata in sessionConfig', async () => {
      const mockAccount = createMockRhinestoneAccount()

      const result = await createRhinestoneSession({
        ownerAddress: OWNER_ADDRESS,
        smartAccountAddress: ACCOUNT_ADDRESS,
        chainId: 11155111,
        rhinestoneAccount: mockAccount,
        chain: MOCK_CHAIN,
      })

      const { session } = result._unsafeUnwrap()
      const parsed = JSON.parse(session.sessionConfig)

      expect(parsed).toEqual({ provider: 'rhinestone', chainId: 11155111 })
    })

    it('respects config.validUntil when provided', async () => {
      const mockAccount = createMockRhinestoneAccount()
      const validUntil = Date.now() + 3600_000

      const result = await createRhinestoneSession({
        ownerAddress: OWNER_ADDRESS,
        smartAccountAddress: ACCOUNT_ADDRESS,
        chainId: 11155111,
        rhinestoneAccount: mockAccount,
        chain: MOCK_CHAIN,
        config: { validUntil },
      })

      const { session } = result._unsafeUnwrap()

      expect(session.validUntil).toBe(validUntil)
    })

    it('returns SessionError when SDK call fails', async () => {
      const mockAccount = createMockRhinestoneAccount()
      ;(
        mockAccount.experimental_getSessionDetails as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('SDK error'))

      const result = await createRhinestoneSession({
        ownerAddress: OWNER_ADDRESS,
        smartAccountAddress: ACCOUNT_ADDRESS,
        chainId: 11155111,
        rhinestoneAccount: mockAccount,
        chain: MOCK_CHAIN,
      })

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(SessionError)
      expect(result._unsafeUnwrapErr().message).toContain('SDK error')
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
      enableSignature: MOCK_ENABLE_SIGNATURE,
      hashesAndChainIds: JSON.stringify([
        { chainId: '11155111', sessionDigest: '0xdigest123' },
      ]),
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
