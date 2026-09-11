import { describe, expect, it } from 'vitest'
import { toExistenceSignal } from './useNameClassification'

describe('toExistenceSignal', () => {
  it('does not trust stale owner data after an owner refetch fails', () => {
    expect(
      toExistenceSignal({
        isProfileName: true,
        ownerPending: false,
        ownerError: true,
        hasOwner: true,
        indexerPending: false,
        indexerError: false,
        indexerHit: false,
      }),
    ).toEqual({ status: 'unknown' })
  })

  it('trusts a positive source when the other source fails', () => {
    expect(
      toExistenceSignal({
        isProfileName: true,
        ownerPending: false,
        ownerError: true,
        hasOwner: true,
        indexerPending: false,
        indexerError: false,
        indexerHit: true,
      }),
    ).toEqual({ status: 'owned' })
  })
})
