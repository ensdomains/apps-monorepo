import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { createFlowScope, scopeTransactionId } from './flow-identity'

const ACCOUNT = '0xAAaAaAAaAAAaAaaAaaAAAAAaaAAaAAAAaAAAaAaA' as Address
const OTHER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address

describe('createFlowScope', () => {
  it('lower-cases the account so a checksummed address scopes the same way', () => {
    expect(createFlowScope(ACCOUNT).account).toBe(ACCOUNT.toLowerCase())
  })

  it('gives every attempt its own nonce', () => {
    expect(createFlowScope(ACCOUNT).nonce).not.toBe(
      createFlowScope(ACCOUNT).nonce,
    )
  })
})

describe('scopeTransactionId', () => {
  it('returns the base id when there is no attempt in progress', () => {
    expect(scopeTransactionId('tx-revoke-roles', null)).toBe('tx-revoke-roles')
    expect(scopeTransactionId('tx-revoke-roles', undefined)).toBe(
      'tx-revoke-roles',
    )
  })

  it('keeps the base id as a prefix so logs stay readable', () => {
    const id = scopeTransactionId('tx-revoke-roles', createFlowScope(ACCOUNT))

    expect(id.startsWith('tx-revoke-roles')).toBe(true)
    expect(id).not.toBe('tx-revoke-roles')
  })

  it('separates two attempts by the same account', () => {
    expect(scopeTransactionId('step', createFlowScope(ACCOUNT))).not.toBe(
      scopeTransactionId('step', createFlowScope(ACCOUNT)),
    )
  })

  it('separates the same attempt number across accounts', () => {
    expect(scopeTransactionId('step', createFlowScope(ACCOUNT))).not.toBe(
      scopeTransactionId('step', createFlowScope(OTHER)),
    )
  })

  it('is stable for a scope that is reused across renders', () => {
    const scope = createFlowScope(ACCOUNT)

    expect(scopeTransactionId('step', scope)).toBe(
      scopeTransactionId('step', scope),
    )
  })
})
