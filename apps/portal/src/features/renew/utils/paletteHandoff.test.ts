import { describe, expect, it } from 'vitest'
import {
  getRenewalGateReadiness,
  getRenewalPaletteState,
  isSupportedRenewalTarget,
} from './paletteHandoff'

describe('renewal palette destination', () => {
  it('withholds active progress when the renewal widget cannot render its modal', () => {
    expect(
      getRenewalPaletteState({
        name: 'bob.eth',
        isChecking: false,
        canExtend: false,
        hasCheckError: false,
        isOperationInFlight: true,
        activeTransactionId: 'alice-active',
        transactionIds: ['alice-active'],
      }).canViewActiveOperation,
    ).toBe(false)
  })
  it('blocks a new palette intent before eligibility settles when another operation is in flight', () => {
    expect(
      getRenewalPaletteState({
        name: 'bob.eth',
        isChecking: true,
        canExtend: false,
        hasCheckError: false,
        isOperationInFlight: true,
        activeTransactionId: 'alice-active',
        transactionIds: [],
      }),
    ).toEqual({
      canViewActiveOperation: false,
      readiness: {
        reason:
          'Another operation is already in progress. Open its original page to view progress, then try renewing bob.eth again.',
      },
    })
  })

  it.each([
    [[], false],
    [['other-operation'], false],
    [['alice-active'], true],
  ])(
    'offers active progress only when this modal can render its actual transaction: %j',
    (transactionIds, expected) => {
      expect(
        getRenewalPaletteState({
          name: 'bob.eth',
          isChecking: false,
          canExtend: true,
          hasCheckError: false,
          isOperationInFlight: true,
          activeTransactionId: 'alice-active',
          transactionIds,
        }).canViewActiveOperation,
      ).toBe(expected)
    },
  )
  it.each([
    ['alice.eth', true],
    ['sub.alice.eth', false],
    ['alice.xyz', false],
    ['ALICE.eth', false],
  ])(
    'allows only a canonical directly renewable target: %s',
    (name, expected) => {
      expect(isSupportedRenewalTarget(name)).toBe(expected)
    },
  )

  it('waits for eligibility and leaves successful handoff to the existing renewal button', () => {
    const input = {
      name: 'alice.eth',
      ownerStatus: 'success' as const,
      hasResolverError: false,
    }
    expect(
      getRenewalGateReadiness({
        ...input,
        eligibility: {
          canExtend: false,
          isChecking: true,
          hasCheckError: false,
        },
      }),
    ).toBe('checking')
    expect(
      getRenewalGateReadiness({
        ...input,
        eligibility: {
          canExtend: true,
          isChecking: false,
          hasCheckError: false,
        },
      }),
    ).toBe('checking')
    expect(
      getRenewalGateReadiness({
        ...input,
        eligibility: {
          canExtend: false,
          isChecking: false,
          hasCheckError: false,
        },
      }),
    ).toEqual({ reason: 'alice.eth cannot be renewed here right now.' })
  })

  it('reports failed verification instead of treating it as an eligibility refusal', () => {
    expect(
      getRenewalGateReadiness({
        name: 'alice.eth',
        ownerStatus: 'error',
        hasResolverError: false,
        eligibility: {
          canExtend: false,
          isChecking: false,
          hasCheckError: false,
        },
      }),
    ).toEqual({
      reason:
        'Could not check renewal for alice.eth. Refresh the name and try again.',
    })
  })
})
