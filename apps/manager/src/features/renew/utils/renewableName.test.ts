import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MS_PER_DAY,
  V2_GRACE_PERIOD_DAYS,
} from '@/features/grace/utils/gracePeriod'
import {
  canRenewV2Name,
  resolveRenewalLabel,
  toCanonicalRenewableName,
} from './renewableName'

const base = new Date('2024-06-01T12:00:00Z')

describe('canRenewV2Name', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows renew during grace', () => {
    vi.setSystemTime(base.getTime() + MS_PER_DAY)
    expect(canRenewV2Name('alice.eth', base)).toBe(true)
  })

  // The normalized twin can belong to someone else; callers canonicalize first.
  it('blocks non-normalized names during grace', () => {
    vi.setSystemTime(base.getTime() + MS_PER_DAY)
    expect(canRenewV2Name('Alice.eth', base)).toBe(false)
    expect(canRenewV2Name('Alice.ETH', base)).toBe(false)
    expect(canRenewV2Name('ali\u00ADce.eth', base)).toBe(false)
  })

  it('blocks renew after grace', () => {
    vi.setSystemTime(base.getTime() + V2_GRACE_PERIOD_DAYS * MS_PER_DAY)
    expect(canRenewV2Name('alice.eth', base)).toBe(false)
  })
})

describe('resolveRenewalLabel', () => {
  it('returns the label for an already-normalized name', () => {
    expect(resolveRenewalLabel('alice.eth')._unsafeUnwrap()).toBe('alice')
  })

  it.each([
    'ALICE.eth',
    'Alice.ETH',
  ])('refuses %s rather than resolving it to a twin label', (name) => {
    const result = resolveRenewalLabel(name)
    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().reason).toBe('LABEL_NOT_NORMALIZED')
  })

  it('refuses an invisible character at parse time, before normalising', () => {
    const result = resolveRenewalLabel('ali\u00ADce.eth')
    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().reason).toBe('NOT_NORMALIZED')
  })
})

describe('toCanonicalRenewableName', () => {
  it.each([
    ['alice.eth', 'alice.eth'],
    ['ALICE.eth', 'alice.eth'],
    ['alice', 'alice.eth'],
  ])('canonicalizes %s to %s', (input, expected) => {
    expect(toCanonicalRenewableName(input)).toBe(expected)
  })

  it('has no canonical name for a label hiding an invisible character', () => {
    // A soft hyphen renders as `alice` but isn't typed as one; redirecting it
    // to `alice.eth` would quietly swap the name the user followed.
    expect(toCanonicalRenewableName('ali\u00ADce.eth')).toBeNull()
  })

  it('returns null for names that are not renewable at all', () => {
    expect(toCanonicalRenewableName('sub.alice.eth')).toBeNull()
    expect(toCanonicalRenewableName('alice.com')).toBeNull()
  })
})
