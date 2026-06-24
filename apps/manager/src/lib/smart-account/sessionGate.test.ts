import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  needsSessionBeforeRegistration,
  sessionHydrationKey,
} from './sessionGate'

type GateInput = Parameters<typeof needsSessionBeforeRegistration>[0]

const rhinestone = (hasActiveSession: boolean): GateInput =>
  ({ signer: { type: 'rhinestone' }, hasActiveSession }) as GateInput

describe('needsSessionBeforeRegistration', () => {
  it('requires enabling a session on the HCA path when none is active', () => {
    expect(needsSessionBeforeRegistration(rhinestone(false))).toBe(true)
  })

  it('does NOT require enabling when a session is already active (reuse)', () => {
    expect(needsSessionBeforeRegistration(rhinestone(true))).toBe(false)
  })

  it('does NOT require a session on the EOA path', () => {
    expect(
      needsSessionBeforeRegistration({
        signer: { type: 'eoa' } as GateInput['signer'],
        hasActiveSession: false,
      }),
    ).toBe(false)
  })

  it('does NOT require a session when there is no signer yet', () => {
    expect(
      needsSessionBeforeRegistration({ signer: null, hasActiveSession: false }),
    ).toBe(false)
  })
})

describe('sessionHydrationKey', () => {
  const OWNER = '0xOWNER000000000000000000000000000000beef' as Address
  const HCA = '0xHCA0000000000000000000000000000000000cafe' as Address

  it('returns null when there is no owner', () => {
    expect(sessionHydrationKey(null, null)).toBeNull()
    expect(sessionHydrationKey(undefined, HCA)).toBeNull()
  })

  it('is owner-only while the HCA address is not yet known', () => {
    expect(sessionHydrationKey(OWNER, null)).toBe(OWNER.toLowerCase())
  })

  // The core regression: the key MUST change once the HCA address arrives, so
  // the hydration effect re-runs and performs the (account-scoped) localStorage
  // lookup. An owner-only key would be identical before/after the account
  // resolves → effect short-circuits → session never hydrated → ENABLE
  // re-prompts on every reload.
  it('CHANGES once the HCA address arrives (owner resolves first on reload)', () => {
    const ownerOnly = sessionHydrationKey(OWNER, null)
    const withAccount = sessionHydrationKey(OWNER, HCA)
    expect(withAccount).not.toBe(ownerOnly)
    expect(withAccount).toBe(`${OWNER.toLowerCase()}:${HCA.toLowerCase()}`)
  })

  it('is stable for the same owner+account (no redundant re-runs)', () => {
    expect(sessionHydrationKey(OWNER, HCA)).toBe(
      sessionHydrationKey(OWNER, HCA),
    )
  })

  it('changes when the account changes (different HCA → re-scope lookup)', () => {
    const other = '0xHCA000000000000000000000000000000000beef' as Address
    expect(sessionHydrationKey(OWNER, HCA)).not.toBe(
      sessionHydrationKey(OWNER, other),
    )
  })
})
