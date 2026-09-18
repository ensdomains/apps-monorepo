import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { TransactionPayloadSchema, UpsertTransactionSchema } from './index'

const validUpsert = {
  txId: 'tx-123',
  chainId: 11155111,
  hash: '0xabc',
  status: 'success' as const,
  operation: 'set-resolver' as const,
  name: 'leon.eth',
  payload: {
    to: '0x1234567890123456789012345678901234567890',
    value: '42',
    error: 'reverted',
  },
}

describe('TransactionPayloadSchema', () => {
  it('accepts the legitimate summary fields', () => {
    const parsed = v.safeParse(TransactionPayloadSchema, {
      to: '0x1234567890123456789012345678901234567890',
      value: '42',
      error: 'reverted',
    })

    expect(parsed.success).toBe(true)
  })

  it('rejects unknown payload properties', () => {
    const parsed = v.safeParse(TransactionPayloadSchema, {
      to: '0x1234567890123456789012345678901234567890',
      extra: 'nope',
    })

    expect(parsed.success).toBe(false)
  })

  it('accepts a reasonably large error string', () => {
    const parsed = v.safeParse(TransactionPayloadSchema, {
      error: 'e'.repeat(8 * 1024),
    })

    expect(parsed.success).toBe(true)
  })

  it('rejects an error larger than the configured maximum', () => {
    const parsed = v.safeParse(TransactionPayloadSchema, {
      error: 'e'.repeat(16 * 1024 + 1),
    })

    expect(parsed.success).toBe(false)
  })
})

describe('UpsertTransactionSchema', () => {
  it('accepts a normal transaction-history upsert', () => {
    const parsed = v.safeParse(UpsertTransactionSchema, validUpsert)

    expect(parsed.success).toBe(true)
  })

  it('keeps optional and null fields optional/nullable', () => {
    const parsed = v.safeParse(UpsertTransactionSchema, {
      txId: 'tx-123',
      chainId: 1,
      status: 'pending',
      hash: null,
      operation: null,
      name: null,
      payload: null,
    })

    expect(parsed.success).toBe(true)
  })

  it.each([
    ['txId', { ...validUpsert, txId: 't'.repeat(257) }],
    ['hash', { ...validUpsert, hash: 'h'.repeat(129) }],
    ['name', { ...validUpsert, name: 'n'.repeat(1025) }],
  ] as const)('rejects an oversized %s', (_field, value) => {
    const parsed = v.safeParse(UpsertTransactionSchema, value)

    expect(parsed.success).toBe(false)
  })
})
