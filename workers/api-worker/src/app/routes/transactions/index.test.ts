import { sign } from 'hono/jwt'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const returning = vi.fn()
  const mockDb = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning,
        })),
      })),
    })),
  }

  return {
    returning,
    getDatabase: vi.fn(() => mockDb),
  }
})

vi.mock('#core/database/index.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('#core/database/index.js')>()
  return {
    ...actual,
    getDatabase: mocks.getDatabase,
  }
})

import transactionsApp from './index'

const JWT_SECRET = 'test-jwt-secret'
const env = { JWT_SECRET } as CloudflareBindings

const validBody = {
  txId: 'tx-123',
  chainId: 11155111,
  hash: '0xabc',
  status: 'success',
  operation: 'set-resolver',
  name: 'leon.eth',
  payload: {
    to: '0x1234567890123456789012345678901234567890',
    value: '42',
    error: 'reverted',
  },
}

const savedRow = {
  user_id: 'user-1',
  tx_id: validBody.txId,
  chain_id: validBody.chainId,
  hash: validBody.hash,
  status: validBody.status,
  operation: validBody.operation,
  name: validBody.name,
  payload: validBody.payload,
}

const authHeader = async () => {
  const token = await sign(
    {
      user_id: 'user-1',
      address: '0xabc',
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    JWT_SECRET,
    'HS256',
  )
  return { Authorization: `Bearer ${token}` }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.returning.mockResolvedValue([savedRow])
})

describe('POST /transactions', () => {
  it('upserts a normal transaction-history payload', async () => {
    const res = await transactionsApp.request(
      '/transactions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await authHeader()),
        },
        body: JSON.stringify(validBody),
      },
      env,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ transaction: savedRow })
    expect(mocks.getDatabase).toHaveBeenCalledOnce()
  })

  it('returns 413 when the request body exceeds the route size limit', async () => {
    const res = await transactionsApp.request(
      '/transactions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...validBody,
          name: 'n'.repeat(32 * 1024),
        }),
      },
      env,
    )

    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'payload too large' })
    expect(mocks.getDatabase).not.toHaveBeenCalled()
  })
})
