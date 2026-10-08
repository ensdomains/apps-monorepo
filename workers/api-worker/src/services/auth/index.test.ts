import { errAsync, ok, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '#core/database/index.js'

vi.mock('#core/auth/jwt.js', () => ({
  signJWT: vi.fn(),
}))

vi.mock('../users', () => ({
  addUserIfNotExists: vi.fn(),
}))

vi.mock('./helpers', () => ({
  safeParseSiweMessage: vi.fn(),
  safeVerifySiweMessage: vi.fn(),
}))

import { signJWT } from '#core/auth/jwt.js'
import { addUserIfNotExists } from '../users'
import { safeParseSiweMessage, safeVerifySiweMessage } from './helpers'
import { createJWT, createNonce, hashRedemptionToken } from './index.js'

const ADDRESS = '0x0000000000000000000000000000000000000001' as const
const MESSAGE =
  'sepolia.app.ens.domains wants you to sign in with your Ethereum account.'
const SIGNATURE = `0x${'11'.repeat(65)}` as `0x${string}`

type AuthAttempt = {
  nonce: string
  redemption_token_hash: string
  expires_at: Date
}

function createFakeDb() {
  const findFirst = vi.fn()
  const insertValues = vi.fn().mockResolvedValue([])
  const deleteReturning = vi.fn()

  const db = {
    query: {
      authAttempts: {
        findFirst,
      },
    },
    insert: vi.fn(() => ({ values: insertValues })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({ returning: deleteReturning })),
    })),
  } as unknown as Database

  return { db, deleteReturning, findFirst, insertValues }
}

const authArgs = (overrides: Partial<Parameters<typeof createJWT>[0]> = {}) =>
  ({
    env: { JWT_SECRET: 'test-secret' },
    client: {} as Parameters<typeof createJWT>[0]['client'],
    db: createFakeDb().db,
    address: ADDRESS,
    message: MESSAGE,
    signature: SIGNATURE,
    nonce: 'test-nonce',
    redemptionToken: '11'.repeat(32),
    ...overrides,
  }) as Parameters<typeof createJWT>[0]

describe('SIWE authentication attempt binding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()

    vi.mocked(safeParseSiweMessage).mockReturnValue(
      ok({
        domain: 'sepolia.app.ens.domains',
        uri: 'https://sepolia.app.ens.domains',
      } as never),
    )
    vi.mocked(safeVerifySiweMessage).mockReturnValue(okAsync(true))
    vi.mocked(addUserIfNotExists).mockReturnValue(
      okAsync({ id: 'user-id' } as never),
    )
    vi.mocked(signJWT).mockReturnValue(okAsync('jwt-token'))
  })

  it('issues an independent token and stores only its SHA-256 hash', async () => {
    const { db, insertValues } = createFakeDb()

    const result = await createNonce(db)

    expect(result.isOk()).toBe(true)
    const { nonce, redemptionToken } = result._unsafeUnwrap()
    const inserted = insertValues.mock.calls[0]?.[0] as AuthAttempt
    const hash = await hashRedemptionToken(redemptionToken)

    expect(nonce).toEqual(expect.any(String))
    expect(redemptionToken).toMatch(/^[0-9a-f]{64}$/)
    expect(inserted).toEqual({
      nonce,
      redemption_token_hash: hash._unsafeUnwrap(),
      expires_at: expect.any(Date),
    })
    expect(inserted.redemption_token_hash).not.toBe(redemptionToken)
    expect(inserted.expires_at.getTime() - Date.now()).toBeCloseTo(
      30 * 60 * 1000,
      -2,
    )
  })

  it('rejects an observed transcript without burning the legitimate attempt', async () => {
    const fake = createFakeDb()
    const pending: AuthAttempt = {
      nonce: 'test-nonce',
      redemption_token_hash: 'stored-hash',
      expires_at: new Date(Date.now() + 60_000),
    }
    fake.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(pending)
    fake.deleteReturning.mockResolvedValueOnce([{ nonce: pending.nonce }])

    const attacker = await createJWT(
      authArgs({ db: fake.db, redemptionToken: '22'.repeat(32) }),
    )
    const legitimate = await createJWT(
      authArgs({ db: fake.db, redemptionToken: '11'.repeat(32) }),
    )

    expect(attacker.isErr()).toBe(true)
    expect(attacker._unsafeUnwrapErr()._tag).toBe('INVALID_NONCE')
    expect(legitimate).toEqual(ok('jwt-token'))
    expect(safeVerifySiweMessage).toHaveBeenCalledTimes(1)
  })

  it('keeps token binding scoped to each attempt', async () => {
    const fake = createFakeDb()
    const attemptB: AuthAttempt = {
      nonce: 'nonce-b',
      redemption_token_hash: 'hash-b',
      expires_at: new Date(Date.now() + 60_000),
    }
    fake.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(attemptB)
    fake.deleteReturning.mockResolvedValueOnce([{ nonce: attemptB.nonce }])

    const crossAttempt = await createJWT(
      authArgs({
        db: fake.db,
        nonce: 'nonce-b',
        redemptionToken: 'token-a',
      }),
    )
    const correctAttempt = await createJWT(
      authArgs({
        db: fake.db,
        nonce: 'nonce-b',
        redemptionToken: 'token-b',
      }),
    )

    expect(crossAttempt.isErr()).toBe(true)
    expect(correctAttempt).toEqual(ok('jwt-token'))
    expect(fake.deleteReturning).toHaveBeenCalledTimes(1)
  })

  it('allows EOA and ERC-1271 verification through the existing SIWE verifier', async () => {
    const fake = createFakeDb()
    const pending: AuthAttempt = {
      nonce: 'test-nonce',
      redemption_token_hash: 'stored-hash',
      expires_at: new Date(Date.now() + 60_000),
    }
    fake.findFirst.mockResolvedValue(pending)
    fake.deleteReturning.mockResolvedValue([{ nonce: pending.nonce }])

    const contractWalletClient = { readContract: vi.fn() }
    const result = await createJWT(
      authArgs({ db: fake.db, client: contractWalletClient as never }),
    )

    expect(result).toEqual(ok('jwt-token'))
    expect(safeVerifySiweMessage).toHaveBeenCalledWith(
      contractWalletClient,
      expect.objectContaining({ address: ADDRESS, nonce: 'test-nonce' }),
    )
  })

  it('rejects replay after the atomic consume succeeds', async () => {
    const fake = createFakeDb()
    const pending: AuthAttempt = {
      nonce: 'test-nonce',
      redemption_token_hash: 'stored-hash',
      expires_at: new Date(Date.now() + 60_000),
    }
    fake.findFirst
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(undefined)
    fake.deleteReturning.mockResolvedValueOnce([{ nonce: pending.nonce }])

    const first = await createJWT(authArgs({ db: fake.db }))
    const second = await createJWT(authArgs({ db: fake.db }))

    expect(first).toEqual(ok('jwt-token'))
    expect(second.isErr()).toBe(true)
    expect(second._unsafeUnwrapErr()._tag).toBe('INVALID_NONCE')
    expect(signJWT).toHaveBeenCalledTimes(1)
  })

  it('allows exactly one result when concurrent requests race to consume', async () => {
    const fake = createFakeDb()
    const pending: AuthAttempt = {
      nonce: 'test-nonce',
      redemption_token_hash: 'stored-hash',
      expires_at: new Date(Date.now() + 60_000),
    }
    fake.findFirst.mockResolvedValue(pending)
    fake.deleteReturning
      .mockResolvedValueOnce([{ nonce: pending.nonce }])
      .mockResolvedValueOnce([])

    const results = await Promise.all([
      createJWT(authArgs({ db: fake.db })),
      createJWT(authArgs({ db: fake.db })),
    ])

    expect(results.filter((result) => result.isOk())).toHaveLength(1)
    expect(results.filter((result) => result.isErr())).toHaveLength(1)
    expect(
      results.find((result) => result.isErr())?._unsafeUnwrapErr()._tag,
    ).toBe('INVALID_NONCE')
    expect(fake.deleteReturning).toHaveBeenCalledTimes(2)
  })

  it('does not consume an expired attempt', async () => {
    const fake = createFakeDb()
    fake.findFirst.mockResolvedValue(undefined)

    const result = await createJWT(authArgs({ db: fake.db }))

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()._tag).toBe('INVALID_NONCE')
    expect(safeVerifySiweMessage).not.toHaveBeenCalled()
    expect(fake.deleteReturning).not.toHaveBeenCalled()
  })

  it('fails closed when pending-attempt lookup fails', async () => {
    const fake = createFakeDb()
    fake.findFirst.mockRejectedValue(new Error('database unavailable'))

    const result = await createJWT(authArgs({ db: fake.db }))

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()._tag).toBe('DATABASE_ERROR')
    expect(safeVerifySiweMessage).not.toHaveBeenCalled()
    expect(signJWT).not.toHaveBeenCalled()
  })

  it('does not return a JWT when final atomic consume fails', async () => {
    const fake = createFakeDb()
    const pending: AuthAttempt = {
      nonce: 'test-nonce',
      redemption_token_hash: 'stored-hash',
      expires_at: new Date(Date.now() + 60_000),
    }
    fake.findFirst.mockResolvedValue(pending)
    fake.deleteReturning.mockRejectedValue(new Error('database unavailable'))

    const result = await createJWT(authArgs({ db: fake.db }))

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()._tag).toBe('DATABASE_ERROR')
    expect(signJWT).toHaveBeenCalledTimes(1)
  })

  it('leaves the attempt usable when JWT signing fails', async () => {
    const fake = createFakeDb()
    const pending: AuthAttempt = {
      nonce: 'test-nonce',
      redemption_token_hash: 'stored-hash',
      expires_at: new Date(Date.now() + 60_000),
    }
    fake.findFirst.mockResolvedValueOnce(pending).mockResolvedValueOnce(pending)
    vi.mocked(signJWT)
      .mockReturnValueOnce(errAsync(new Error('signing failed') as never))
      .mockReturnValueOnce(okAsync('jwt-token'))
    fake.deleteReturning.mockResolvedValueOnce([{ nonce: pending.nonce }])

    const failed = await createJWT(authArgs({ db: fake.db }))
    const retried = await createJWT(authArgs({ db: fake.db }))

    expect(failed.isErr()).toBe(true)
    expect(retried).toEqual(ok('jwt-token'))
    expect(fake.deleteReturning).toHaveBeenCalledTimes(1)
  })
})
