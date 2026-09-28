import { describe, expect, it } from 'vitest'
import { getPushProposalState } from './pushProposal'

const current = {
  isEnabled: false,
  isSupported: true,
  permission: 'granted' as const,
  isFetching: false,
  isError: false,
}

describe('reviewed browser push direction', () => {
  it('retains the ordinary settings control without an AI proposal', () => {
    expect(getPushProposalState(current)).toBe('default')
  })

  it.each([
    'default',
    'granted',
    'denied',
  ] as const)('never offers enable when already disabled with %s permission', (permission) => {
    expect(
      getPushProposalState({ ...current, proposedEnabled: false, permission }),
    ).toBe('already_disabled')
  })

  it('never offers disable when the requested subscription is already active', () => {
    expect(
      getPushProposalState({
        ...current,
        proposedEnabled: true,
        isEnabled: true,
      }),
    ).toBe('already_enabled')
  })

  it.each([
    'default',
    'granted',
    'denied',
  ] as const)('can remove a matching current subscription with %s permission', (permission) => {
    expect(
      getPushProposalState({
        ...current,
        proposedEnabled: false,
        isEnabled: true,
        permission,
      }),
    ).toBe('disable')
  })

  it.each([
    'default',
    'granted',
  ] as const)('offers only enable when requested with %s permission', (permission) => {
    expect(
      getPushProposalState({ ...current, proposedEnabled: true, permission }),
    ).toBe('enable')
  })

  it('keeps a denied enable request blocked without exposing disable', () => {
    expect(
      getPushProposalState({
        ...current,
        proposedEnabled: true,
        permission: 'denied',
      }),
    ).toBe('blocked')
  })

  it.each([
    true,
    false,
  ])('fails closed until browser state is ready: %s', (proposedEnabled) => {
    expect(
      getPushProposalState({ ...current, proposedEnabled, isFetching: true }),
    ).toBe('checking')
    expect(
      getPushProposalState({ ...current, proposedEnabled, isError: true }),
    ).toBe('unavailable')
    expect(
      getPushProposalState({ ...current, proposedEnabled, isSupported: false }),
    ).toBe('unsupported')
  })
})
