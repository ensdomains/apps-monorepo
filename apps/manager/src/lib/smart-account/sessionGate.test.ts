import { describe, expect, it } from 'vitest'
import { needsSessionBeforeRegistration } from './sessionGate'

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
